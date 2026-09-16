'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { inspectWorkbook } from '@/lib/excel';
import { suggestMapping, type ColumnMapping, type DateOrder } from '@/lib/mapping';
import { runImport, type ImportMode } from '@/lib/import';
import type { ImportState, SheetInfo } from './state';

const MAX_BYTES = 20 * 1024 * 1024;

async function fileToBuffer(formData: FormData) {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a spreadsheet to upload.' as const };
  }
  if (file.size > MAX_BYTES) {
    return {
      error: `That file is ${(file.size / 1_048_576).toFixed(1)} MB; the limit is 20 MB. Split it into smaller sheets.` as const,
    };
  }
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    return { error: 'Upload an .xlsx or .xlsm file. Save .xls or .csv files as .xlsx first.' as const };
  }
  return { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name };
}

function readOptions(formData: FormData) {
  const raw = String(formData.get('mapping') ?? '{}');
  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(raw) as ColumnMapping;
  } catch {
    throw new Error('The column mapping could not be read.');
  }

  const asOfRaw = String(formData.get('asOfDate') ?? '');
  const asOfDate = asOfRaw ? new Date(asOfRaw) : new Date();
  if (Number.isNaN(asOfDate.getTime())) throw new Error('The "as of" date is not a valid date.');

  return {
    mapping,
    options: {
      mode: String(formData.get('mode') ?? 'UPSERT') as ImportMode,
      dateOrder: String(formData.get('dateOrder') ?? 'dmy') as DateOrder,
      actor: String(formData.get('actor') ?? '').trim() || 'HQ',
      asOfDate,
      defaultLocationId: String(formData.get('defaultLocationId') ?? '') || null,
      defaultCardTypeId: String(formData.get('defaultCardTypeId') ?? '') || null,
      defaultClientId: String(formData.get('defaultClientId') ?? '') || null,
      defaultIssuerId: String(formData.get('defaultIssuerId') ?? '') || null,
      createMissingLocations: formData.get('createMissingLocations') === 'on',
      createMissingCardTypes: formData.get('createMissingCardTypes') === 'on',
      markVerified: formData.get('markVerified') === 'on',
    },
  };
}

/**
 * One action drives all three steps (analyse, dry run, commit) so the browser
 * keeps a single form and re-posts the chosen file with each step.
 */
export async function importStep(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const intent = String(formData.get('intent') ?? 'analyze');
  const loaded = await fileToBuffer(formData);
  if ('error' in loaded) return { stage: 'idle', error: loaded.error };

  const requestedSheet = String(formData.get('sheetName') ?? '') || undefined;
  const headerRowRaw = Number(formData.get('headerRow'));
  const headerRow = Number.isInteger(headerRowRaw) && headerRowRaw > 0 ? headerRowRaw : undefined;

  try {
    const { previews, target } = await inspectWorkbook(loaded.buffer, requestedSheet, headerRow);
    const sheets: SheetInfo[] = previews.map((s) => ({ ...s, suggestion: suggestMapping(s.headers) }));

    const base: ImportState = {
      stage: 'analyzed',
      filename: loaded.filename,
      activeSheet: target.name,
      sheets,
    };

    if (intent === 'analyze') return base;

    const { mapping, options } = readOptions(formData);
    const dryRun = intent !== 'commit';

    const result = await runImport(
      target,
      mapping,
      { ...options, filename: loaded.filename, sheetName: target.name },
      dryRun,
    );

    if (dryRun) {
      return { ...base, stage: 'previewed', result };
    }

    const saveAs = String(formData.get('saveMappingAs') ?? '').trim();
    if (saveAs) {
      await prisma.importMapping.upsert({
        where: { name: saveAs },
        create: {
          name: saveAs,
          mappingJson: JSON.stringify(mapping),
          description: `Saved from ${loaded.filename}`,
        },
        update: {
          mappingJson: JSON.stringify(mapping),
          description: `Updated from ${loaded.filename}`,
        },
      });
    }

    revalidatePath('/');
    revalidatePath('/cards');
    revalidatePath('/locations');
    revalidatePath('/import');

    return {
      ...base,
      stage: 'committed',
      result,
      notice: `Imported ${loaded.filename}: ${result.summary.created} created, ${result.summary.updated} updated.`,
    };
  } catch (err) {
    return { stage: 'idle', error: (err as Error).message, filename: loaded.filename };
  }
}
