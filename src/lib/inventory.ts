import type { Card, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ON_HAND_STATUSES, type CardStatus, type MovementType } from '@/lib/constants';

export type TxClient = Prisma.TransactionClient;

export type CardChange = {
  locationId?: string | null;
  status?: CardStatus;
  issuedTo?: string | null;
  issuedAt?: Date | null;
  activatedAt?: Date | null;
  expiryDate?: Date | null;
  batchRef?: string | null;
  notes?: string | null;
  maskedPan?: string | null;
  proxy?: string | null;
  cardTypeId?: string;
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
};

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
  const data: Prisma.CardUpdateInput = {};
  let touched = false;

  const locationChanged =
    change.locationId !== undefined && change.locationId !== card.locationId;
  const statusChanged = change.status !== undefined && change.status !== card.status;

  if (locationChanged) {
    data.location = change.locationId
      ? { connect: { id: change.locationId } }
      : { disconnect: true };
    touched = true;
  }
  if (statusChanged) {
    data.status = change.status;
    touched = true;
  }

  const scalarKeys = [
    'issuedTo',
    'issuedAt',
    'activatedAt',
    'expiryDate',
    'batchRef',
    'notes',
    'maskedPan',
    'proxy',
  ] as const;

  for (const key of scalarKeys) {
    const incoming = change[key];
    if (incoming === undefined) continue;
    const current = card[key];
    const same =
      current instanceof Date && incoming instanceof Date
        ? current.getTime() === incoming.getTime()
        : current === incoming;
    if (!same) {
      (data as Record<string, unknown>)[key] = incoming;
      touched = true;
    }
  }

  if (change.cardTypeId !== undefined && change.cardTypeId !== card.cardTypeId) {
    data.cardType = { connect: { id: change.cardTypeId } };
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
    },
  });

  return updated;
}

/** Create a card and open its ledger with an initial entry. */
export async function createCardWithMovement(
  tx: TxClient,
  input: {
    serial: string;
    cardTypeId: string;
    status: CardStatus;
    locationId?: string | null;
    maskedPan?: string | null;
    proxy?: string | null;
    batchRef?: string | null;
    expiryDate?: Date | null;
    issuedTo?: string | null;
    issuedAt?: Date | null;
    activatedAt?: Date | null;
    notes?: string | null;
    lastVerifiedAt?: Date | null;
    lastVerifiedBy?: string | null;
  },
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
        {
          locationId: toLocationId,
          status: markInTransit ? 'IN_TRANSIT' : undefined,
        },
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

export function onHandWhere(): Prisma.CardWhereInput {
  return { status: { in: ON_HAND_STATUSES } };
}
