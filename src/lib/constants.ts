// Single source of truth for the vocabulary the app uses.
// SQLite has no enums, so these constants guard the String columns instead.

export const CARD_STATUSES = [
  'IN_STOCK',
  'IN_TRANSIT',
  'ISSUED',
  'REGISTERED',
  'RETURNED',
  'LOST',
  'DAMAGED',
  'EXPIRED',
  'DISPOSED',
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  IN_STOCK: 'In stock',
  IN_TRANSIT: 'In transit',
  ISSUED: 'Issued',
  REGISTERED: 'Registered',
  RETURNED: 'Returned',
  LOST: 'Lost',
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired',
  DISPOSED: 'Disposed',
};

// Statuses that represent a physical card still sitting somewhere in the network
// as available stock, and therefore countable during a physical stock count.
export const ON_HAND_STATUSES: CardStatus[] = ['IN_STOCK', 'RETURNED'];

// Once a card is registered it is live with a cardholder, so it stops counting
// as available stock. This is what makes registration "deduct from inventory".
export const IN_CIRCULATION_STATUSES: CardStatus[] = ['ISSUED', 'REGISTERED'];

// Statuses that mean the card has permanently left inventory.
export const TERMINAL_STATUSES: CardStatus[] = ['DISPOSED', 'EXPIRED'];

// Statuses that should raise operational attention.
export const EXCEPTION_STATUSES: CardStatus[] = ['LOST', 'DAMAGED'];

/// A card can only be registered from a state where it physically exists and
/// has not already left circulation.
export const REGISTRABLE_STATUSES: CardStatus[] = ['IN_STOCK', 'IN_TRANSIT', 'ISSUED', 'RETURNED'];

/// What can still be disposed of — anything not already gone.
export const DISPOSABLE_STATUSES: CardStatus[] = [
  'IN_STOCK',
  'IN_TRANSIT',
  'ISSUED',
  'REGISTERED',
  'RETURNED',
  'LOST',
  'DAMAGED',
  'EXPIRED',
];

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
  'ORDER_RECEIPT',
  'RECEIPT',
  'DELIVERY_DISPATCH',
  'DELIVERY_RECEIPT',
  'TRANSFER',
  'ISSUE',
  'REGISTER',
  'RETURN',
  'DISPOSE',
  'STATUS_CHANGE',
  'ADJUSTMENT',
  'IMPORT_CREATE',
  'IMPORT_UPDATE',
  'COUNT_ADJUSTMENT',
  'VERIFY',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  ORDER_RECEIPT: 'Order received',
  RECEIPT: 'Receipt',
  DELIVERY_DISPATCH: 'Dispatched',
  DELIVERY_RECEIPT: 'Delivered',
  TRANSFER: 'Transfer',
  ISSUE: 'Issued',
  REGISTER: 'Registered',
  RETURN: 'Return',
  DISPOSE: 'Disposed',
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

export const ORDER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'IN_PRODUCTION',
  'SHIPPED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  IN_PRODUCTION: 'In production',
  SHIPPED: 'Shipped',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

/// Orders still expected to bring stock in — the incoming pipeline.
export const OPEN_ORDER_STATUSES: OrderStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_PRODUCTION',
  'SHIPPED',
  'PARTIALLY_RECEIVED',
];

export const DELIVERY_STATUSES = ['DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  DRAFT: 'Draft',
  DISPATCHED: 'Dispatched',
  RECEIVED: 'Received onboard',
  CANCELLED: 'Cancelled',
};

export const DISPOSAL_REASONS = ['DAMAGED', 'EXPIRED', 'RECALLED', 'FRAUD', 'OBSOLETE', 'OTHER'] as const;
export type DisposalReason = (typeof DISPOSAL_REASONS)[number];

export const DISPOSAL_REASON_LABELS: Record<DisposalReason, string> = {
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired',
  RECALLED: 'Recalled by issuer',
  FRAUD: 'Fraud / compromised',
  OBSOLETE: 'Obsolete product',
  OTHER: 'Other',
};

export const DISPOSAL_METHODS = ['SHREDDED', 'RETURNED_TO_ISSUER', 'INCINERATED', 'OTHER'] as const;
export type DisposalMethod = (typeof DISPOSAL_METHODS)[number];

export const DISPOSAL_METHOD_LABELS: Record<DisposalMethod, string> = {
  SHREDDED: 'Shredded',
  RETURNED_TO_ISSUER: 'Returned to issuer',
  INCINERATED: 'Incinerated',
  OTHER: 'Other',
};

export const REGISTRATION_RESULTS = ['REGISTERED', 'ALREADY_REGISTERED', 'NOT_FOUND', 'REJECTED'] as const;
export type RegistrationResult = (typeof REGISTRATION_RESULTS)[number];

export const REGISTRATION_RESULT_LABELS: Record<RegistrationResult, string> = {
  REGISTERED: 'Registered',
  ALREADY_REGISTERED: 'Already registered',
  NOT_FOUND: 'Serial not in system',
  REJECTED: 'Rejected',
};

// How long a card's location may go unverified before we flag it as stale.
// Overridable per location via Location.countIntervalDays.
export const DEFAULT_STALE_DAYS = 90;

export function isCardStatus(value: string): value is CardStatus {
  return (CARD_STATUSES as readonly string[]).includes(value);
}

export function isLocationType(value: string): value is LocationType {
  return (LOCATION_TYPES as readonly string[]).includes(value);
}
