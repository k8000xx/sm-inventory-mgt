// Single source of truth for the vocabulary the app uses.
// SQLite has no enums, so these constants guard the String columns instead.

export const CARD_STATUSES = [
  'IN_STOCK',
  'IN_TRANSIT',
  'ISSUED',
  'ACTIVATED',
  'RETURNED',
  'LOST',
  'DAMAGED',
  'EXPIRED',
  'DESTROYED',
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  IN_STOCK: 'In stock',
  IN_TRANSIT: 'In transit',
  ISSUED: 'Issued',
  ACTIVATED: 'Activated',
  RETURNED: 'Returned',
  LOST: 'Lost',
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired',
  DESTROYED: 'Destroyed',
};

// Statuses that represent a physical card still sitting somewhere in the network
// and therefore still countable during a physical stock count.
export const ON_HAND_STATUSES: CardStatus[] = ['IN_STOCK', 'RETURNED'];

// Statuses that mean the card has permanently left inventory.
export const TERMINAL_STATUSES: CardStatus[] = ['DESTROYED', 'EXPIRED'];

// Statuses that should raise operational attention.
export const EXCEPTION_STATUSES: CardStatus[] = ['LOST', 'DAMAGED'];

export const LOCATION_TYPES = ['VESSEL', 'OFFICE', 'WAREHOUSE', 'AGENT', 'TRANSIT'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  VESSEL: 'Vessel',
  OFFICE: 'Office',
  WAREHOUSE: 'Warehouse',
  AGENT: 'Agent',
  TRANSIT: 'In transit',
};

export const MOVEMENT_TYPES = [
  'RECEIPT',
  'TRANSFER',
  'ISSUE',
  'RETURN',
  'STATUS_CHANGE',
  'ADJUSTMENT',
  'IMPORT_CREATE',
  'IMPORT_UPDATE',
  'COUNT_ADJUSTMENT',
  'VERIFY',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  RECEIPT: 'Receipt',
  TRANSFER: 'Transfer',
  ISSUE: 'Issue',
  RETURN: 'Return',
  STATUS_CHANGE: 'Status change',
  ADJUSTMENT: 'Adjustment',
  IMPORT_CREATE: 'Import (new)',
  IMPORT_UPDATE: 'Import (update)',
  COUNT_ADJUSTMENT: 'Count adjustment',
  VERIFY: 'Verified',
};

export const STOCK_COUNT_STATUSES = ['DRAFT', 'SUBMITTED', 'RECONCILED'] as const;
export type StockCountStatus = (typeof STOCK_COUNT_STATUSES)[number];

export const COUNT_RESULTS = ['MATCH', 'MISSING', 'UNEXPECTED'] as const;
export type CountResult = (typeof COUNT_RESULTS)[number];

// How long a card's location may go unverified before we flag it as stale.
// Overridable per location via Location.countIntervalDays.
export const DEFAULT_STALE_DAYS = 90;

export function isCardStatus(value: string): value is CardStatus {
  return (CARD_STATUSES as readonly string[]).includes(value);
}

export function isLocationType(value: string): value is LocationType {
  return (LOCATION_TYPES as readonly string[]).includes(value);
}
