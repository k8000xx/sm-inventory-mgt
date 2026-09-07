import { prisma } from '@/lib/db';
import {
  CARD_STATUSES,
  EXCEPTION_STATUSES,
  ON_HAND_STATUSES,
  type CardStatus,
} from '@/lib/constants';

export type LocationPosition = {
  id: string;
  code: string;
  name: string;
  type: string;
  region: string | null;
  reorderPoint: number;
  countIntervalDays: number;
  onHand: number;
  issued: number;
  exceptions: number;
  total: number;
  lastVerifiedAt: Date | null;
  daysSinceVerified: number | null;
  /** true when the location has gone past its own agreed count interval */
  stale: boolean;
  lowStock: boolean;
};

export async function getStatusTotals(): Promise<Record<CardStatus, number>> {
  const grouped = await prisma.card.groupBy({ by: ['status'], _count: { _all: true } });
  const totals = Object.fromEntries(CARD_STATUSES.map((s) => [s, 0])) as Record<CardStatus, number>;
  for (const g of grouped) {
    if (g.status in totals) totals[g.status as CardStatus] = g._count._all;
  }
  return totals;
}

/**
 * Per-location position, combining the book balance with how long it has been
 * since anybody physically confirmed it. The second half is what stops a tidy
 * looking number from being mistaken for a true one.
 */
export async function getLocationPositions(): Promise<LocationPosition[]> {
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  const grouped = await prisma.card.groupBy({
    by: ['locationId', 'status'],
    _count: { _all: true },
  });

  const verified = await prisma.card.groupBy({
    by: ['locationId'],
    _max: { lastVerifiedAt: true },
  });
  const lastVerifiedByLocation = new Map(
    verified.map((v) => [v.locationId ?? '', v._max.lastVerifiedAt]),
  );

  const counts = new Map<string, Map<string, number>>();
  for (const g of grouped) {
    const locId = g.locationId ?? '';
    if (!counts.has(locId)) counts.set(locId, new Map());
    counts.get(locId)!.set(g.status, g._count._all);
  }

  return locations.map((loc) => {
    const byStatus = counts.get(loc.id) ?? new Map<string, number>();
    const sum = (statuses: readonly string[]) =>
      statuses.reduce((acc, s) => acc + (byStatus.get(s) ?? 0), 0);

    const onHand = sum(ON_HAND_STATUSES);
    const issued = sum(['ISSUED', 'ACTIVATED']);
    const exceptions = sum(EXCEPTION_STATUSES);
    const total = [...byStatus.values()].reduce((a, b) => a + b, 0);

    const lastVerifiedAt = lastVerifiedByLocation.get(loc.id) ?? null;
    const daysSinceVerified = lastVerifiedAt
      ? Math.floor((Date.now() - lastVerifiedAt.getTime()) / 86_400_000)
      : null;

    return {
      id: loc.id,
      code: loc.code,
      name: loc.name,
      type: loc.type,
      region: loc.region,
      reorderPoint: loc.reorderPoint,
      countIntervalDays: loc.countIntervalDays,
      onHand,
      issued,
      exceptions,
      total,
      lastVerifiedAt,
      daysSinceVerified,
      // Never verified counts as stale the moment the location holds stock.
      stale:
        total > 0 && (daysSinceVerified === null || daysSinceVerified > loc.countIntervalDays),
      lowStock: onHand <= loc.reorderPoint && loc.reorderPoint > 0,
    };
  });
}

export async function getUnassignedCount(): Promise<number> {
  return prisma.card.count({ where: { locationId: null } });
}

export async function getExpiringSoon(days = 90) {
  const cutoff = new Date(Date.now() + days * 86_400_000);
  return prisma.card.findMany({
    where: {
      expiryDate: { lte: cutoff, gte: new Date() },
      status: { in: [...ON_HAND_STATUSES, 'ISSUED', 'ACTIVATED', 'IN_TRANSIT'] },
    },
    include: { location: true, cardType: true },
    orderBy: { expiryDate: 'asc' },
    take: 25,
  });
}

export async function getRecentMovements(take = 15) {
  return prisma.movement.findMany({
    orderBy: { occurredAt: 'desc' },
    take,
    include: {
      card: { select: { serial: true } },
      fromLocation: { select: { name: true, code: true } },
      toLocation: { select: { name: true, code: true } },
    },
  });
}

export async function getOpenStockCounts() {
  return prisma.stockCount.findMany({
    where: { status: { in: ['DRAFT', 'SUBMITTED'] } },
    include: { location: true, _count: { select: { lines: true } } },
    orderBy: { countDate: 'desc' },
  });
}
