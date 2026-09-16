import type { Card, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ON_HAND_STATUSES, type CardStatus, type MovementType } from '@/lib/constants';

export type TxClient = Prisma.TransactionClient;

/** Scalar fields a change may set. Relations are handled separately below. */
const SCALAR_KEYS = [
  'issuedTo',
  'issuedAt',
  'registeredAt',
  'deliveredAt',
  'disposedAt',
  'disposalReason',
  'expiryDate',
  'batchRef',
  'notes',
  'maskedPan',
  'proxy',
] as const;

type ScalarKey = (typeof SCALAR_KEYS)[number];

export type CardChange = Partial<Pick<Card, ScalarKey>> & {
  locationId?: string | null;
  clientId?: string | null;
  cardholderId?: string | null;
  cardTypeId?: string;
  orderLineId?: string | null;
  status?: CardStatus;
  /** Set when a human physically laid eyes on the card. */
  verified?: { by: string; at?: Date };
};

export type MovementContext = {
  type: MovementType;
  actor: string;
  reference?: string | null;
  notes?: string | null;
  occurredAt?: Date;
  importBatchId?: string | null;
  stockCountId?: string | null;
  cardOrderId?: string | null;
  deliveryId?: string | null;
  disposalId?: string | null;
  registrationBatchId?: string | null;
};

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/**
 * Apply a change to a card and write the matching ledger entry in the same
 * transaction. Every card mutation in the app funnels through here, so the
 * Movement table is a complete history — that is what makes a remote,
 * unverifiable inventory auditable after the fact.
 *
 * Returns null when the change is a no-op, so imports do not spam the ledger.
 */
export async function applyCardChange(
  tx: TxClient,
  card: Card,
  change: CardChange,
  ctx: MovementContext,
): Promise<Card | null> {
  const data: Prisma.CardUncheckedUpdateInput = {};
  let touched = false;

  const locationChanged = change.locationId !== undefined && change.locationId !== card.locationId;
  const statusChanged = change.status !== undefined && change.status !== card.status;

  if (locationChanged) {
    data.locationId = change.locationId;
    touched = true;
  }
  if (statusChanged) {
    data.status = change.status;
    touched = true;
  }

  // Other foreign keys carry no ledger semantics of their own, so they are
  // treated like plain fields.
  for (const key of ['clientId', 'cardholderId', 'cardTypeId', 'orderLineId'] as const) {
    const incoming = change[key];
    if (incoming === undefined || incoming === card[key]) continue;
    (data as Record<string, unknown>)[key] = incoming;
    touched = true;
  }

  for (const key of SCALAR_KEYS) {
    const incoming = change[key];
    if (incoming === undefined || sameValue(card[key], incoming)) continue;
    (data as Record<string, unknown>)[key] = incoming;
    touched = true;
  }

  if (change.verified) {
    data.lastVerifiedAt = change.verified.at ?? new Date();
    data.lastVerifiedBy = change.verified.by;
    touched = true;
  }

  if (!touched) return null;

  const updated = await tx.card.update({ where: { id: card.id }, data });

  await tx.movement.create({
    data: {
      cardId: card.id,
      type: ctx.type,
      fromLocationId: locationChanged ? card.locationId : null,
      toLocationId: locationChanged ? change.locationId ?? null : null,
      fromStatus: statusChanged ? card.status : null,
      toStatus: statusChanged ? change.status ?? null : null,
      reference: ctx.reference ?? null,
      actor: ctx.actor,
      notes: ctx.notes ?? null,
      occurredAt: ctx.occurredAt ?? new Date(),
      importBatchId: ctx.importBatchId ?? null,
      stockCountId: ctx.stockCountId ?? null,
      cardOrderId: ctx.cardOrderId ?? null,
      deliveryId: ctx.deliveryId ?? null,
      disposalId: ctx.disposalId ?? null,
      registrationBatchId: ctx.registrationBatchId ?? null,
    },
  });

  return updated;
}

export type NewCardInput = {
  serial: string;
  cardTypeId: string;
  status: CardStatus;
  clientId?: string | null;
  locationId?: string | null;
  cardholderId?: string | null;
  orderLineId?: string | null;
  maskedPan?: string | null;
  proxy?: string | null;
  batchRef?: string | null;
  expiryDate?: Date | null;
  issuedTo?: string | null;
  issuedAt?: Date | null;
  registeredAt?: Date | null;
  deliveredAt?: Date | null;
  notes?: string | null;
  lastVerifiedAt?: Date | null;
  lastVerifiedBy?: string | null;
};

/** Create a card and open its ledger with an initial entry. */
export async function createCardWithMovement(
  tx: TxClient,
  input: NewCardInput,
  ctx: MovementContext,
): Promise<Card> {
  const card = await tx.card.create({ data: input });

  await tx.movement.create({
    data: {
      cardId: card.id,
      type: ctx.type,
      toLocationId: card.locationId,
      toStatus: card.status,
      reference: ctx.reference ?? null,
      actor: ctx.actor,
      notes: ctx.notes ?? null,
      occurredAt: ctx.occurredAt ?? new Date(),
      importBatchId: ctx.importBatchId ?? null,
      stockCountId: ctx.stockCountId ?? null,
      cardOrderId: ctx.cardOrderId ?? null,
      deliveryId: ctx.deliveryId ?? null,
      disposalId: ctx.disposalId ?? null,
      registrationBatchId: ctx.registrationBatchId ?? null,
    },
  });

  return card;
}

/** Bulk transfer of cards between locations, one ledger entry per card. */
export async function transferCards(input: {
  cardIds: string[];
  toLocationId: string;
  actor: string;
  reference?: string | null;
  notes?: string | null;
  markInTransit?: boolean;
}): Promise<number> {
  const { cardIds, toLocationId, actor, reference, notes, markInTransit } = input;
  if (cardIds.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    const cards = await tx.card.findMany({ where: { id: { in: cardIds } } });
    let changed = 0;
    for (const card of cards) {
      const result = await applyCardChange(
        tx,
        card,
        { locationId: toLocationId, status: markInTransit ? 'IN_TRANSIT' : undefined },
        { type: 'TRANSFER', actor, reference, notes },
      );
      if (result) changed += 1;
    }
    return changed;
  });
}

/** Bulk status change, one ledger entry per card. */
export async function setCardStatuses(input: {
  cardIds: string[];
  status: CardStatus;
  actor: string;
  reference?: string | null;
  notes?: string | null;
}): Promise<number> {
  const { cardIds, status, actor, reference, notes } = input;
  if (cardIds.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    const cards = await tx.card.findMany({ where: { id: { in: cardIds } } });
    let changed = 0;
    for (const card of cards) {
      const result = await applyCardChange(
        tx,
        card,
        { status },
        { type: 'STATUS_CHANGE', actor, reference, notes },
      );
      if (result) changed += 1;
    }
    return changed;
  });
}

/**
 * Hand cards to a cardholder. Issuing does not make a card live — registration
 * does — but it does take it off the shelf.
 */
export async function issueCards(input: {
  cardIds: string[];
  cardholderId: string;
  actor: string;
  issuedAt?: Date;
  reference?: string | null;
  notes?: string | null;
}): Promise<number> {
  const { cardIds, cardholderId, actor, issuedAt, reference, notes } = input;
  if (cardIds.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    const holder = await tx.cardholder.findUnique({ where: { id: cardholderId } });
    if (!holder) throw new Error('That cardholder no longer exists.');

    const cards = await tx.card.findMany({ where: { id: { in: cardIds } } });
    let changed = 0;
    for (const card of cards) {
      const result = await applyCardChange(
        tx,
        card,
        {
          cardholderId,
          clientId: card.clientId ?? holder.clientId,
          // A card already registered stays registered; issuing only records who holds it.
          status: card.status === 'REGISTERED' ? undefined : 'ISSUED',
          issuedTo: `${holder.firstName} ${holder.lastName}`.trim(),
          issuedAt: issuedAt ?? new Date(),
        },
        { type: 'ISSUE', actor, reference, notes },
      );
      if (result) changed += 1;
    }
    return changed;
  });
}

export function onHandWhere(): Prisma.CardWhereInput {
  return { status: { in: ON_HAND_STATUSES } };
}
