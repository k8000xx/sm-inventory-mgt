import { prisma } from '@/lib/db';
import { maskPan } from '@/lib/format';
import { applyCardChange, createCardWithMovement } from '@/lib/inventory';
import { normaliseStatus, parseDate, type ColumnMapping, type DateOrder } from '@/lib/mapping';
import type { ParsedSheet } from '@/lib/excel';
import type { CardStatus } from '@/lib/constants';

export type ImportMode = 'UPSERT' | 'CREATE_ONLY' | 'UPDATE_ONLY';

export type ImportOptions = {
  mode: ImportMode;
  dateOrder: DateOrder;
  actor: string;
  filename: string;
  sheetName?: string;
  /** The date the spreadsheet describes, which is rarely the date it is uploaded. */
  asOfDate: Date;
  defaultLocationId?: string | null;
  defaultCardTypeId?: string | null;
  createMissingLocations: boolean;
  createMissingCardTypes: boolean;
  /** Count this file as a physical confirmation of where the cards are. */
  markVerified: boolean;
};

export type RowIssue = {
  row: number;
  serial: string;
  level: 'error' | 'warning';
  message: string;
};

export type PlannedRow = {
  row: number;
  serial: string;
  action: 'create' | 'update' | 'unchanged' | 'skip';
  reason?: string;
  changes: string[];
};

export type ImportResult = {
  summary: {
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    errored: number;
  };
  newLocations: string[];
  newCardTypes: string[];
  issues: RowIssue[];
  rows: PlannedRow[];
  importBatchId?: string;
};

type ResolvedRow = {
  row: number;
  serial: string;
  cardTypeId: string;
  locationId: string | null | undefined;
  status: CardStatus | undefined;
  proxy: string | undefined;
  maskedPan: string | undefined;
  batchRef: string | undefined;
  expiryDate: Date | undefined;
  issuedTo: string | undefined;
  issuedAt: Date | undefined;
  activatedAt: Date | undefined;
  notes: string | undefined;
};

const key = (s: string) => s.trim().toLowerCase();

export async function runImport(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  options: ImportOptions,
  dryRun: boolean,
): Promise<ImportResult> {
  const issues: RowIssue[] = [];
  const rows: PlannedRow[] = [];

  if (mapping.serial === undefined) {
    throw new Error('The "Card serial" column must be mapped before importing.');
  }

  const [locations, cardTypes] = await Promise.all([
    prisma.location.findMany(),
    prisma.cardType.findMany(),
  ]);

  const locationIndex = new Map<string, string>();
  for (const l of locations) {
    locationIndex.set(key(l.code), l.id);
    locationIndex.set(key(l.name), l.id);
  }
  const cardTypeIndex = new Map<string, string>();
  for (const t of cardTypes) {
    cardTypeIndex.set(key(t.code), t.id);
    cardTypeIndex.set(key(t.name), t.id);
  }

  const cell = (rowValues: string[], field: keyof ColumnMapping): string => {
    const idx = mapping[field];
    if (idx === undefined || idx < 0) return '';
    return (rowValues[idx] ?? '').trim();
  };

  // ---- pass 1: resolve every row without writing anything -------------------
  const newLocationNames = new Set<string>();
  const newCardTypeNames = new Set<string>();
  const seenSerials = new Set<string>();
  const resolved: ResolvedRow[] = [];

  sheet.rows.forEach((values, i) => {
    const rowNumber = i + 1;
    const serial = cell(values, 'serial');

    if (!serial) {
      issues.push({ row: rowNumber, serial: '', level: 'warning', message: 'No serial number — row ignored.' });
      rows.push({ row: rowNumber, serial: '', action: 'skip', reason: 'No serial', changes: [] });
      return;
    }
    if (seenSerials.has(key(serial))) {
      issues.push({ row: rowNumber, serial, level: 'error', message: 'Duplicate serial within this file.' });
      rows.push({ row: rowNumber, serial, action: 'skip', reason: 'Duplicate in file', changes: [] });
      return;
    }
    seenSerials.add(key(serial));

    // Location
    let locationId: string | null | undefined;
    const locationRaw = cell(values, 'location');
    if (locationRaw) {
      const found = locationIndex.get(key(locationRaw));
      if (found) {
        locationId = found;
      } else if (options.createMissingLocations) {
        newLocationNames.add(locationRaw);
        locationId = `NEW:${key(locationRaw)}`;
      } else {
        issues.push({ row: rowNumber, serial, level: 'error', message: `Unknown location "${locationRaw}".` });
        rows.push({ row: rowNumber, serial, action: 'skip', reason: 'Unknown location', changes: [] });
        return;
      }
    } else if (options.defaultLocationId) {
      locationId = options.defaultLocationId;
    }

    // Card type
    let cardTypeId: string | undefined;
    const typeRaw = cell(values, 'cardType');
    if (typeRaw) {
      const found = cardTypeIndex.get(key(typeRaw));
      if (found) {
        cardTypeId = found;
      } else if (options.createMissingCardTypes) {
        newCardTypeNames.add(typeRaw);
        cardTypeId = `NEW:${key(typeRaw)}`;
      } else {
        issues.push({ row: rowNumber, serial, level: 'error', message: `Unknown card type "${typeRaw}".` });
        rows.push({ row: rowNumber, serial, action: 'skip', reason: 'Unknown card type', changes: [] });
        return;
      }
    } else if (options.defaultCardTypeId) {
      cardTypeId = options.defaultCardTypeId;
    } else {
      issues.push({
        row: rowNumber,
        serial,
        level: 'error',
        message: 'No card type on the row and no default card type selected.',
      });
      rows.push({ row: rowNumber, serial, action: 'skip', reason: 'No card type', changes: [] });
      return;
    }

    // Status
    let status: CardStatus | undefined;
    const statusRaw = cell(values, 'status');
    if (statusRaw) {
      const parsed = normaliseStatus(statusRaw);
      if (parsed) {
        status = parsed;
      } else {
        issues.push({ row: rowNumber, serial, level: 'error', message: `Unrecognised status "${statusRaw}".` });
        rows.push({ row: rowNumber, serial, action: 'skip', reason: 'Unrecognised status', changes: [] });
        return;
      }
    }

    const readDate = (field: keyof ColumnMapping, label: string): Date | undefined => {
      const raw = cell(values, field);
      if (!raw) return undefined;
      const parsed = parseDate(raw, options.dateOrder);
      if (!parsed) {
        issues.push({ row: rowNumber, serial, level: 'warning', message: `Could not read ${label} "${raw}" — left unchanged.` });
        return undefined;
      }
      return parsed;
    };

    const panRaw = cell(values, 'pan');
    const masked = panRaw ? maskPan(panRaw) : null;
    if (panRaw && !masked) {
      issues.push({ row: rowNumber, serial, level: 'warning', message: `Card number "${panRaw}" had fewer than 4 digits — ignored.` });
    }

    resolved.push({
      row: rowNumber,
      serial,
      cardTypeId,
      locationId,
      status,
      proxy: cell(values, 'proxy') || undefined,
      maskedPan: masked ?? undefined,
      batchRef: cell(values, 'batchRef') || undefined,
      expiryDate: readDate('expiryDate', 'expiry date'),
      issuedTo: cell(values, 'issuedTo') || undefined,
      issuedAt: readDate('issuedAt', 'issue date'),
      activatedAt: readDate('activatedAt', 'activation date'),
      notes: cell(values, 'notes') || undefined,
    });
  });

  // ---- pass 2: work out create vs update vs unchanged -----------------------
  const existing = await prisma.card.findMany({
    where: { serial: { in: resolved.map((r) => r.serial) } },
  });
  const existingBySerial = new Map(existing.map((c) => [key(c.serial), c]));

  const summary = { total: sheet.rows.length, created: 0, updated: 0, unchanged: 0, skipped: 0, errored: 0 };

  const toCreate: ResolvedRow[] = [];
  const toUpdate: { resolved: ResolvedRow; changes: string[] }[] = [];

  for (const r of resolved) {
    const card = existingBySerial.get(key(r.serial));

    if (card && options.mode === 'CREATE_ONLY') {
      rows.push({ row: r.row, serial: r.serial, action: 'skip', reason: 'Already exists (create-only mode)', changes: [] });
      continue;
    }
    if (!card && options.mode === 'UPDATE_ONLY') {
      rows.push({ row: r.row, serial: r.serial, action: 'skip', reason: 'Not in system (update-only mode)', changes: [] });
      continue;
    }

    if (!card) {
      const changes: string[] = [];
      if (r.locationId) changes.push('location');
      changes.push(`status ${r.status ?? 'IN_STOCK'}`);
      rows.push({ row: r.row, serial: r.serial, action: 'create', changes });
      toCreate.push(r);
      continue;
    }

    const changes: string[] = [];
    if (r.locationId !== undefined && r.locationId !== card.locationId) changes.push('location');
    if (r.status !== undefined && r.status !== card.status) changes.push(`status ${card.status} → ${r.status}`);
    if (r.cardTypeId !== card.cardTypeId) changes.push('card type');
    if (r.proxy !== undefined && r.proxy !== card.proxy) changes.push('proxy');
    if (r.maskedPan !== undefined && r.maskedPan !== card.maskedPan) changes.push('card number');
    if (r.batchRef !== undefined && r.batchRef !== card.batchRef) changes.push('batch');
    if (r.issuedTo !== undefined && r.issuedTo !== card.issuedTo) changes.push('issued to');
    if (r.notes !== undefined && r.notes !== card.notes) changes.push('notes');
    for (const [field, label] of [['expiryDate', 'expiry'], ['issuedAt', 'issue date'], ['activatedAt', 'activation date']] as const) {
      const incoming = r[field];
      const current = card[field];
      if (incoming && incoming.getTime() !== (current?.getTime() ?? -1)) changes.push(label);
    }

    if (changes.length === 0 && !options.markVerified) {
      rows.push({ row: r.row, serial: r.serial, action: 'unchanged', changes: [] });
      continue;
    }

    rows.push({
      row: r.row,
      serial: r.serial,
      action: changes.length === 0 ? 'unchanged' : 'update',
      changes,
    });
    toUpdate.push({ resolved: r, changes });
  }

  summary.created = toCreate.length;
  summary.updated = toUpdate.filter((u) => u.changes.length > 0).length;
  summary.unchanged = rows.filter((r) => r.action === 'unchanged').length;
  summary.skipped = rows.filter((r) => r.action === 'skip').length;
  summary.errored = issues.filter((i) => i.level === 'error').length;

  const result: ImportResult = {
    summary,
    newLocations: [...newLocationNames],
    newCardTypes: [...newCardTypeNames],
    issues,
    rows,
  };

  if (dryRun) return result;

  // ---- pass 3: write ---------------------------------------------------------
  const importBatch = await prisma.importBatch.create({
    data: {
      filename: options.filename,
      sheetName: options.sheetName ?? null,
      uploadedBy: options.actor,
      mode: options.mode,
      rowsTotal: summary.total,
      rowsCreated: summary.created,
      rowsUpdated: summary.updated,
      rowsSkipped: summary.skipped,
      rowsErrored: summary.errored,
      mappingJson: JSON.stringify(mapping),
      errorsJson: JSON.stringify(issues.slice(0, 500)),
    },
  });

  await prisma.$transaction(
    async (tx) => {
      // Materialise anything the file referred to but the system did not have.
      const placeholderLocations = new Map<string, string>();
      for (const name of newLocationNames) {
        const created = await tx.location.create({
          data: {
            code: await uniqueCode(tx, 'location', name),
            name,
            type: 'OFFICE',
            notes: `Created automatically from import "${options.filename}".`,
          },
        });
        placeholderLocations.set(`NEW:${key(name)}`, created.id);
      }
      const placeholderTypes = new Map<string, string>();
      for (const name of newCardTypeNames) {
        const created = await tx.cardType.create({
          data: {
            code: await uniqueCode(tx, 'cardType', name),
            name,
            description: `Created automatically from import "${options.filename}".`,
          },
        });
        placeholderTypes.set(`NEW:${key(name)}`, created.id);
      }

      const realLocation = (id: string | null | undefined) =>
        id && id.startsWith('NEW:') ? placeholderLocations.get(id)! : id;
      const realType = (id: string) => (id.startsWith('NEW:') ? placeholderTypes.get(id)! : id);

      const ctxBase = {
        actor: options.actor,
        reference: options.filename,
        occurredAt: options.asOfDate,
        importBatchId: importBatch.id,
      };

      for (const r of toCreate) {
        await createCardWithMovement(
          tx,
          {
            serial: r.serial,
            cardTypeId: realType(r.cardTypeId),
            status: r.status ?? 'IN_STOCK',
            locationId: realLocation(r.locationId) ?? null,
            proxy: r.proxy ?? null,
            maskedPan: r.maskedPan ?? null,
            batchRef: r.batchRef ?? null,
            expiryDate: r.expiryDate ?? null,
            issuedTo: r.issuedTo ?? null,
            issuedAt: r.issuedAt ?? null,
            activatedAt: r.activatedAt ?? null,
            notes: r.notes ?? null,
            lastVerifiedAt: options.markVerified ? options.asOfDate : null,
            lastVerifiedBy: options.markVerified ? options.actor : null,
          },
          { ...ctxBase, type: 'IMPORT_CREATE', notes: `Imported from ${options.filename}` },
        );
      }

      for (const { resolved: r } of toUpdate) {
        const card = existingBySerial.get(key(r.serial))!;
        await applyCardChange(
          tx,
          card,
          {
            locationId: r.locationId === undefined ? undefined : realLocation(r.locationId) ?? null,
            status: r.status,
            cardTypeId: realType(r.cardTypeId),
            proxy: r.proxy,
            maskedPan: r.maskedPan,
            batchRef: r.batchRef,
            expiryDate: r.expiryDate,
            issuedTo: r.issuedTo,
            issuedAt: r.issuedAt,
            activatedAt: r.activatedAt,
            notes: r.notes,
            verified: options.markVerified ? { by: options.actor, at: options.asOfDate } : undefined,
          },
          { ...ctxBase, type: 'IMPORT_UPDATE', notes: `Updated from ${options.filename}` },
        );
      }
    },
    { maxWait: 15_000, timeout: 300_000 },
  );

  result.importBatchId = importBatch.id;
  return result;
}

/** Derive a short unique code from a free-text name. */
async function uniqueCode(
  tx: { location: { findUnique: Function }; cardType: { findUnique: Function } },
  model: 'location' | 'cardType',
  name: string,
): Promise<string> {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'IMPORTED';

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt}`;
    const hit = await tx[model].findUnique({ where: { code: candidate } });
    if (!hit) return candidate;
  }
  return `${base}-${Date.now()}`;
}
