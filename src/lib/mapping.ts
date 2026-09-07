import { CARD_STATUSES, type CardStatus } from '@/lib/constants';

/** Every app field an Excel column can be pointed at. */
export const IMPORT_FIELDS = [
  { key: 'serial', label: 'Card serial', required: true, hint: 'Unique physical identifier. This is the key rows are matched on.' },
  { key: 'proxy', label: 'Proxy / reference no.', required: false, hint: 'Issuer proxy or token reference.' },
  { key: 'pan', label: 'Card number (PAN)', required: false, hint: 'Only the last 4 digits are stored. The full number is discarded on import.' },
  { key: 'cardType', label: 'Card type', required: false, hint: 'Matched on card-type code, then name.' },
  { key: 'location', label: 'Location', required: false, hint: 'Matched on location code, then name.' },
  { key: 'status', label: 'Status', required: false, hint: 'Free text is normalised, e.g. "available" becomes In stock.' },
  { key: 'batchRef', label: 'Batch / shipment ref', required: false, hint: '' },
  { key: 'expiryDate', label: 'Expiry date', required: false, hint: '' },
  { key: 'issuedTo', label: 'Issued to', required: false, hint: 'Crew member or employee reference.' },
  { key: 'issuedAt', label: 'Issue date', required: false, hint: '' },
  { key: 'activatedAt', label: 'Activation date', required: false, hint: '' },
  { key: 'notes', label: 'Notes', required: false, hint: '' },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key'];

/** field key -> column index in the sheet (-1 / absent means unmapped) */
export type ColumnMapping = Partial<Record<ImportFieldKey, number>>;

const HEADER_SYNONYMS: Record<ImportFieldKey, string[]> = {
  serial: ['serial', 'serialno', 'serialnumber', 'cardserial', 'serialnum', 'cardref', 'cardreference', 'cardid', 'cardno', 'cardnumber'],
  proxy: ['proxy', 'proxyno', 'proxynumber', 'token', 'tokenid', 'reference', 'refno', 'externalid'],
  pan: ['pan', 'cardnumber', 'cardno', 'primaryaccountnumber', 'accountnumber', 'last4', 'lastfour'],
  cardType: ['cardtype', 'type', 'product', 'productname', 'producttype', 'scheme', 'cardproduct'],
  location: ['location', 'vessel', 'vesselname', 'ship', 'office', 'site', 'branch', 'holder', 'currentlocation', 'locationname', 'depot', 'warehouse'],
  status: ['status', 'cardstatus', 'state', 'condition'],
  batchRef: ['batch', 'batchno', 'batchref', 'batchnumber', 'shipment', 'shipmentref', 'lot', 'lotno', 'consignment'],
  expiryDate: ['expiry', 'expirydate', 'expdate', 'expires', 'validthru', 'validuntil', 'expiration'],
  issuedTo: ['issuedto', 'assignedto', 'crew', 'crewname', 'holdername', 'employee', 'recipient', 'seafarer'],
  issuedAt: ['issuedate', 'issueddate', 'issuedon', 'dateissued', 'distributiondate', 'handoverdate'],
  activatedAt: ['activationdate', 'activateddate', 'activatedon', 'dateactivated', 'activation'],
  notes: ['notes', 'remarks', 'comment', 'comments', 'observation'],
};

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Best-effort guess of which column feeds which field, so a new spreadsheet
 * layout usually needs a glance rather than twelve dropdowns.
 */
export function suggestMapping(headers: string[]): ColumnMapping {
  const normalised = headers.map(normaliseHeader);
  const mapping: ColumnMapping = {};
  const taken = new Set<number>();

  // Exact synonym hits first, so "Card Number" does not steal the serial slot
  // from a column literally called "Serial".
  for (const field of IMPORT_FIELDS) {
    const synonyms = HEADER_SYNONYMS[field.key];
    const idx = normalised.findIndex((h, i) => !taken.has(i) && synonyms.includes(h));
    if (idx >= 0) {
      mapping[field.key] = idx;
      taken.add(idx);
    }
  }

  // Then loose "contains" matches for anything still unmapped.
  for (const field of IMPORT_FIELDS) {
    if (mapping[field.key] !== undefined) continue;
    const synonyms = HEADER_SYNONYMS[field.key];
    const idx = normalised.findIndex(
      (h, i) => !taken.has(i) && h.length > 2 && synonyms.some((s) => h.includes(s) || s.includes(h)),
    );
    if (idx >= 0) {
      mapping[field.key] = idx;
      taken.add(idx);
    }
  }

  return mapping;
}

const STATUS_SYNONYMS: Record<string, CardStatus> = {
  instock: 'IN_STOCK', stock: 'IN_STOCK', available: 'IN_STOCK', unused: 'IN_STOCK',
  onhand: 'IN_STOCK', new: 'IN_STOCK', blank: 'IN_STOCK', unissued: 'IN_STOCK', inventory: 'IN_STOCK',
  intransit: 'IN_TRANSIT', transit: 'IN_TRANSIT', shipped: 'IN_TRANSIT', dispatched: 'IN_TRANSIT',
  onboardship: 'IN_TRANSIT', sent: 'IN_TRANSIT', courier: 'IN_TRANSIT',
  issued: 'ISSUED', distributed: 'ISSUED', assigned: 'ISSUED', allocated: 'ISSUED', handedover: 'ISSUED',
  activated: 'ACTIVATED', active: 'ACTIVATED', inuse: 'ACTIVATED', live: 'ACTIVATED', loaded: 'ACTIVATED',
  returned: 'RETURNED', returnedtostock: 'RETURNED', recovered: 'RETURNED', handedback: 'RETURNED',
  lost: 'LOST', missing: 'LOST', unaccounted: 'LOST', stolen: 'LOST',
  damaged: 'DAMAGED', defective: 'DAMAGED', faulty: 'DAMAGED', broken: 'DAMAGED',
  expired: 'EXPIRED', lapsed: 'EXPIRED',
  destroyed: 'DESTROYED', shredded: 'DESTROYED', disposed: 'DESTROYED', voided: 'DESTROYED', cancelled: 'DESTROYED',
};

export function normaliseStatus(raw: string): CardStatus | null {
  const value = raw.trim();
  if (!value) return null;
  const upper = value.toUpperCase().replace(/[\s-]+/g, '_');
  if ((CARD_STATUSES as readonly string[]).includes(upper)) return upper as CardStatus;
  return STATUS_SYNONYMS[value.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
}

export type DateOrder = 'dmy' | 'mdy';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Excel date cells arrive as ISO strings from the parser; typed text can be
 * anything. `order` resolves the 03/04/2026 ambiguity explicitly rather than
 * guessing, because guessing wrong silently corrupts expiry dates.
 */
export function parseDate(raw: string, order: DateOrder): Date | null {
  const value = raw.trim();
  if (!value) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return makeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const named = /^(\d{1,2})[\s\-/]([a-zA-Z]{3,9})[\s\-/](\d{2,4})$/.exec(value);
  if (named) {
    const month = MONTHS[named[2].toLowerCase().slice(0, 4)] ?? MONTHS[named[2].toLowerCase().slice(0, 3)];
    if (month) return makeDate(expandYear(Number(named[3])), month, Number(named[1]));
  }

  const numeric = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/.exec(value);
  if (numeric) {
    const [a, b, c] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
    if (numeric[1].length === 4) return makeDate(a, b, c);
    const day = order === 'dmy' ? a : b;
    const month = order === 'dmy' ? b : a;
    return makeDate(expandYear(c), month, day);
  }

  // MM/YYYY or MM/YY — common for card expiry, taken as end of month.
  const monthYear = /^(\d{1,2})[\/\-.](\d{2,4})$/.exec(value);
  if (monthYear) {
    const month = Number(monthYear[1]);
    const year = expandYear(Number(monthYear[2]));
    if (month >= 1 && month <= 12) return new Date(Date.UTC(year, month, 0));
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function expandYear(year: number): number {
  if (year >= 100) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

function makeDate(year: number, month: number, day: number): Date | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * How many of these labels look like column headings this app understands.
 * Used to find the real header row in a sheet that opens with a title block.
 */
export function countRecognisedHeaders(headers: string[]): number {
  const normalised = headers.map(normaliseHeader).filter(Boolean);
  const all = new Set(Object.values(HEADER_SYNONYMS).flat());
  return normalised.filter((h) => all.has(h) || [...all].some((s) => h.includes(s) && s.length > 3)).length;
}
