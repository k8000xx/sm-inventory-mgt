import ExcelJS from 'exceljs';
import { countRecognisedHeaders } from '@/lib/mapping';

export type SheetPreview = {
  name: string;
  headers: string[];
  /** 1-based row the headings were read from. */
  headerRow: number;
  sampleRows: string[][];
  rowCount: number;
  /** Columns Excel handed us as numbers long enough to have lost digits. */
  precisionWarnings: string[];
};

export type ParsedSheet = {
  name: string;
  headers: string[];
  headerRow: number;
  rows: string[][];
  precisionWarnings: string[];
};

/** Excel loses integer precision past 15 digits; serials often exceed that. */
const PRECISION_LIMIT = 15;

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    // Avoid 1.23457e+18 turning up as a serial number.
    return Number.isInteger(value) ? BigInt(Math.round(value)).toString() : String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return cellToString(v.result as ExcelJS.CellValue);
    if ('richText' in v && Array.isArray(v.richText)) {
      return (v.richText as { text: string }[]).map((r) => r.text).join('');
    }
    if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink;
  }
  return String(value);
}

async function load(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // ArrayBuffer copy keeps exceljs away from the pooled Node Buffer memory.
  await wb.xlsx.load(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  );
  return wb;
}

/**
 * Find the row that actually holds the column headings.
 *
 * Reports from vessels routinely open with a title, a "prepared by" line and a
 * blank row before the real table starts, and a naive "first row with two
 * filled cells" rule maps the report title as a data column. So every candidate
 * row is scored on how many of its labels look like field headings this app
 * recognises, with the plain filled-cell count as the tiebreak.
 */
function findHeaderRow(sheet: ExcelJS.Worksheet): number {
  const limit = Math.min(sheet.rowCount, 20);
  let bestRow = 1;
  let bestScore = -1;

  for (let i = 1; i <= limit; i += 1) {
    const row = sheet.getRow(i);
    const values: string[] = [];
    const columns = Math.max(sheet.columnCount, row.cellCount);
    for (let c = 1; c <= columns; c += 1) {
      values.push(cellToString(row.getCell(c).value).trim());
    }

    const filled = values.filter(Boolean).length;
    if (filled < 2) continue;

    // A header row is followed by data, not by the end of the sheet.
    const hasRowsBelow = i < sheet.rowCount;
    const score = countRecognisedHeaders(values) * 10 + filled + (hasRowsBelow ? 1 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  return bestRow;
}

function readSheet(
  sheet: ExcelJS.Worksheet,
  options: { rowLimit?: number; headerRow?: number } = {},
): ParsedSheet {
  const { rowLimit } = options;
  const headerRowIndex =
    options.headerRow && options.headerRow >= 1 && options.headerRow <= sheet.rowCount
      ? options.headerRow
      : findHeaderRow(sheet);
  const headerRow = sheet.getRow(headerRowIndex);

  const headers: string[] = [];
  const columnCount = Math.max(sheet.columnCount, headerRow.cellCount);
  for (let c = 1; c <= columnCount; c += 1) {
    const label = cellToString(headerRow.getCell(c).value).trim();
    headers.push(label || `Column ${c}`);
  }

  const rows: string[][] = [];
  const precisionCols = new Set<number>();

  for (let r = headerRowIndex + 1; r <= sheet.rowCount; r += 1) {
    if (rowLimit && rows.length >= rowLimit) break;
    const row = sheet.getRow(r);
    const values: string[] = [];
    let hasContent = false;
    for (let c = 1; c <= columnCount; c += 1) {
      const raw = row.getCell(c).value;
      if (typeof raw === 'number' && Number.isInteger(raw) && String(raw).length > PRECISION_LIMIT) {
        precisionCols.add(c - 1);
      }
      const text = cellToString(raw).trim();
      if (text) hasContent = true;
      values.push(text);
    }
    if (hasContent) rows.push(values);
  }

  return {
    name: sheet.name,
    headers,
    headerRow: headerRowIndex,
    rows,
    precisionWarnings: [...precisionCols].map((i) => headers[i] ?? `Column ${i + 1}`),
  };
}

function toPreview(parsed: ParsedSheet): SheetPreview {
  return {
    name: parsed.name,
    headers: parsed.headers,
    headerRow: parsed.headerRow,
    sampleRows: parsed.rows.slice(0, 8),
    rowCount: parsed.rows.length,
    precisionWarnings: parsed.precisionWarnings,
  };
}

export async function previewWorkbook(buffer: Buffer): Promise<SheetPreview[]> {
  const wb = await load(buffer);
  return wb.worksheets.map((sheet) => toPreview(readSheet(sheet, { rowLimit: 200 })));
}

export async function readWorkbookSheet(
  buffer: Buffer,
  sheetName?: string,
  headerRow?: number,
): Promise<ParsedSheet> {
  const wb = await load(buffer);
  const sheet = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!sheet) throw new Error(`Sheet "${sheetName ?? '(first)'}" was not found in the workbook.`);
  return readSheet(sheet, { headerRow });
}

/** Pull a single column of values out of a sheet — used for stock-count uploads. */
export async function readSerialColumn(
  buffer: Buffer,
  sheetName: string | undefined,
  columnIndex: number,
): Promise<string[]> {
  const parsed = await readWorkbookSheet(buffer, sheetName);
  return parsed.rows.map((row) => (row[columnIndex] ?? '').trim()).filter(Boolean);
}

/**
 * One workbook load that yields both the per-sheet previews (for the mapping UI)
 * and the fully-read target sheet (for the import itself). Reading the file
 * twice for a 20 MB workbook is the kind of waste that shows up as a spinner.
 */
export async function inspectWorkbook(
  buffer: Buffer,
  targetSheetName?: string,
  headerRow?: number,
): Promise<{ previews: SheetPreview[]; target: ParsedSheet }> {
  const wb = await load(buffer);
  if (wb.worksheets.length === 0) throw new Error('That workbook has no sheets.');

  const target = targetSheetName ? wb.getWorksheet(targetSheetName) : wb.worksheets[0];
  if (!target) throw new Error(`Sheet "${targetSheetName}" was not found in the workbook.`);

  const previews: SheetPreview[] = [];
  let parsedTarget: ParsedSheet | null = null;

  for (const sheet of wb.worksheets) {
    if (sheet.id === target.id) {
      // The chosen sheet is read in full and honours a manual header-row override.
      parsedTarget = readSheet(sheet, { headerRow });
      previews.push(toPreview(parsedTarget));
    } else {
      previews.push(toPreview(readSheet(sheet, { rowLimit: 200 })));
    }
  }

  return { previews, target: parsedTarget! };
}
