import { prisma } from '@/lib/db';
import { ON_HAND_STATUSES } from '@/lib/constants';
import { applyCardChange, createCardWithMovement } from '@/lib/inventory';

const key = (s: string) => s.trim().toLowerCase();

export type VarianceSummary = {
  match: number;
  missing: number;
  unexpected: number;
  expected: number;
  counted: number;
};

/**
 * Compare a list of physically-counted serials against what the system believes
 * is sitting at that location, and write one line per finding.
 *
 * "Expected" deliberately means only on-hand statuses: a card ISSUED to a crew
 * member is not in the ship's safe, so its absence from a count is not a
 * variance. If it *is* counted, that is worth surfacing, so it lands as
 * UNEXPECTED with its real status attached.
 */
export async function buildStockCountLines(
  stockCountId: string,
  countedSerialsRaw: string[],
): Promise<VarianceSummary> {
  const count = await prisma.stockCount.findUnique({ where: { id: stockCountId } });
  if (!count) throw new Error('Stock count not found.');
  if (count.status === 'RECONCILED') throw new Error('This count has already been reconciled.');

  // De-duplicate: the same serial scanned twice is one card, not two.
  const countedSerials = [...new Map(countedSerialsRaw.map((s) => [key(s), s.trim()])).values()].filter(Boolean);

  const expected = await prisma.card.findMany({
    where: { locationId: count.locationId, status: { in: ON_HAND_STATUSES } },
  });
  const expectedBySerial = new Map(expected.map((c) => [key(c.serial), c]));

  const countedCards = await prisma.card.findMany({
    where: { serial: { in: countedSerials } },
  });
  const countedBySerial = new Map(countedCards.map((c) => [key(c.serial), c]));

  const lines: {
    stockCountId: string;
    serial: string;
    cardId: string | null;
    result: string;
    systemStatus: string | null;
    systemLocationId: string | null;
  }[] = [];

  const countedKeys = new Set<string>();

  for (const serial of countedSerials) {
    const k = key(serial);
    countedKeys.add(k);
    const card = countedBySerial.get(k) ?? null;
    const isHere = card && card.locationId === count.locationId && ON_HAND_STATUSES.includes(card.status as never);

    lines.push({
      stockCountId,
      serial,
      cardId: card?.id ?? null,
      result: isHere ? 'MATCH' : 'UNEXPECTED',
      systemStatus: card?.status ?? null,
      systemLocationId: card?.locationId ?? null,
    });
  }

  for (const [k, card] of expectedBySerial) {
    if (countedKeys.has(k)) continue;
    lines.push({
      stockCountId,
      serial: card.serial,
      cardId: card.id,
      result: 'MISSING',
      systemStatus: card.status,
      systemLocationId: card.locationId,
    });
  }

  await prisma.$transaction([
    prisma.stockCountLine.deleteMany({ where: { stockCountId } }),
    prisma.stockCountLine.createMany({ data: lines }),
    prisma.stockCount.update({
      where: { id: stockCountId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    }),
  ]);

  return {
    match: lines.filter((l) => l.result === 'MATCH').length,
    missing: lines.filter((l) => l.result === 'MISSING').length,
    unexpected: lines.filter((l) => l.result === 'UNEXPECTED').length,
    expected: expected.length,
    counted: countedSerials.length,
  };
}

export type ReconcileOptions = {
  actor: string;
  /** What to do with stock the system expected but nobody could find. */
  missingAction: 'LOST' | 'LEAVE';
  /** What to do with stock found here that the system had elsewhere. */
  unexpectedAction: 'MOVE' | 'LEAVE';
  /** Create records for counted serials the system has never seen. */
  createUnknown: boolean;
  unknownCardTypeId?: string | null;
};

export type ReconcileResult = {
  verified: number;
  markedLost: number;
  moved: number;
  created: number;
  untouched: number;
};

/**
 * Turn an approved count into ledger movements. This is the only place where a
 * physical count is allowed to overwrite the book position, and every change it
 * makes is written as a COUNT_ADJUSTMENT or VERIFY entry against the count's
 * reference, so an auditor can trace any correction back to the count sheet.
 */
export async function reconcileStockCount(
  stockCountId: string,
  options: ReconcileOptions,
): Promise<ReconcileResult> {
  const count = await prisma.stockCount.findUnique({
    where: { id: stockCountId },
    include: { lines: true, location: true },
  });
  if (!count) throw new Error('Stock count not found.');
  if (count.status === 'RECONCILED') throw new Error('This count has already been reconciled.');
  if (count.lines.length === 0) throw new Error('This count has no lines to reconcile.');

  const result: ReconcileResult = { verified: 0, markedLost: 0, moved: 0, created: 0, untouched: 0 };
  const asOf = count.countDate;
  const ctxBase = {
    actor: options.actor,
    reference: count.reference,
    occurredAt: asOf,
    stockCountId: count.id,
  };

  await prisma.$transaction(
    async (tx) => {
      for (const line of count.lines) {
        let resolution = 'No change';

        if (line.result === 'MATCH' && line.cardId) {
          const card = await tx.card.findUnique({ where: { id: line.cardId } });
          if (card) {
            await applyCardChange(
              tx,
              card,
              { verified: { by: options.actor, at: asOf } },
              { ...ctxBase, type: 'VERIFY', notes: `Physically confirmed at ${count.location.name}` },
            );
            result.verified += 1;
            resolution = 'Confirmed present';
          }
        } else if (line.result === 'MISSING' && line.cardId) {
          if (options.missingAction === 'LOST') {
            const card = await tx.card.findUnique({ where: { id: line.cardId } });
            if (card) {
              await applyCardChange(
                tx,
                card,
                { status: 'LOST' },
                {
                  ...ctxBase,
                  type: 'COUNT_ADJUSTMENT',
                  notes: `Not found during count ${count.reference} at ${count.location.name}`,
                },
              );
              result.markedLost += 1;
              resolution = 'Marked lost';
            }
          } else {
            result.untouched += 1;
            resolution = 'Left as-is for follow-up';
          }
        } else if (line.result === 'UNEXPECTED') {
          if (options.unexpectedAction === 'LEAVE') {
            result.untouched += 1;
            resolution = 'Left as-is for follow-up';
          } else if (line.cardId) {
            const card = await tx.card.findUnique({ where: { id: line.cardId } });
            if (card) {
              await applyCardChange(
                tx,
                card,
                {
                  locationId: count.locationId,
                  status: 'IN_STOCK',
                  verified: { by: options.actor, at: asOf },
                },
                {
                  ...ctxBase,
                  type: 'COUNT_ADJUSTMENT',
                  notes: `Found at ${count.location.name} during count ${count.reference}`,
                },
              );
              result.moved += 1;
              resolution = 'Relocated to this location';
            }
          } else if (options.createUnknown && options.unknownCardTypeId) {
            await createCardWithMovement(
              tx,
              {
                serial: line.serial,
                cardTypeId: options.unknownCardTypeId,
                status: 'IN_STOCK',
                locationId: count.locationId,
                notes: `Discovered during count ${count.reference}.`,
                lastVerifiedAt: asOf,
                lastVerifiedBy: options.actor,
              },
              {
                ...ctxBase,
                type: 'COUNT_ADJUSTMENT',
                notes: `New card discovered during count ${count.reference}`,
              },
            );
            result.created += 1;
            resolution = 'Created from count';
          } else {
            result.untouched += 1;
            resolution = 'Unknown serial — not created';
          }
        }

        await tx.stockCountLine.update({
          where: { id: line.id },
          data: { resolution, resolved: resolution !== 'No change' },
        });
      }

      await tx.stockCount.update({
        where: { id: stockCountId },
        data: { status: 'RECONCILED', reconciledAt: new Date(), reconciledBy: options.actor },
      });
    },
    { maxWait: 15_000, timeout: 300_000 },
  );

  return result;
}
