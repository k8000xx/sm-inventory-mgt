import { prisma } from '@/lib/db';
import {
  CARD_STATUSES,
  EXCEPTION_STATUSES,
  ON_HAND_STATUSES,
  OPEN_ORDER_STATUSES,
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
    const issued = sum(['ISSUED', 'REGISTERED']);
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
      status: { in: [...ON_HAND_STATUSES, 'ISSUED', 'REGISTERED', 'IN_TRANSIT'] },
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

export type ClientPosition = {
  id: string;
  code: string;
  name: string;
  country: string | null;
  onHand: number;
  inTransit: number;
  issued: number;
  registered: number;
  exceptions: number;
  total: number;
  locations: number;
  cardholders: number;
  onOrder: number;
};

/**
 * Per-client position. Cards are client-owned from the order onward, so this is
 * the view that answers "what does this customer actually have?" — including the
 * quantity still on order, which is stock they are counting on but do not yet hold.
 */
export async function getClientPositions(): Promise<ClientPosition[]> {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { locations: true, cardholders: true } } },
  });

  const grouped = await prisma.card.groupBy({
    by: ['clientId', 'status'],
    _count: { _all: true },
  });

  const counts = new Map<string, Map<string, number>>();
  for (const g of grouped) {
    const id = g.clientId ?? '';
    if (!counts.has(id)) counts.set(id, new Map());
    counts.get(id)!.set(g.status, g._count._all);
  }

  // Outstanding order quantity — ordered but not yet booked in.
  const openLines = await prisma.cardOrderLine.findMany({
    where: { order: { status: { in: [...OPEN_ORDER_STATUSES] } } },
    select: { quantity: true, receivedQuantity: true, order: { select: { clientId: true } } },
  });
  const onOrder = new Map<string, number>();
  for (const line of openLines) {
    const outstanding = Math.max(0, line.quantity - line.receivedQuantity);
    onOrder.set(line.order.clientId, (onOrder.get(line.order.clientId) ?? 0) + outstanding);
  }

  return clients.map((c) => {
    const byStatus = counts.get(c.id) ?? new Map<string, number>();
    const sum = (statuses: readonly string[]) =>
      statuses.reduce((acc, s) => acc + (byStatus.get(s) ?? 0), 0);

    return {
      id: c.id,
      code: c.code,
      name: c.name,
      country: c.country,
      onHand: sum(ON_HAND_STATUSES),
      inTransit: byStatus.get('IN_TRANSIT') ?? 0,
      issued: byStatus.get('ISSUED') ?? 0,
      registered: byStatus.get('REGISTERED') ?? 0,
      exceptions: sum(EXCEPTION_STATUSES),
      total: [...byStatus.values()].reduce((a, b) => a + b, 0),
      locations: c._count.locations,
      cardholders: c._count.cardholders,
      onOrder: onOrder.get(c.id) ?? 0,
    };
  });
}

/** Total cards still outstanding on open orders, across all clients. */
export async function getOnOrderTotal(): Promise<number> {
  const lines = await prisma.cardOrderLine.findMany({
    where: { order: { status: { in: [...OPEN_ORDER_STATUSES] } } },
    select: { quantity: true, receivedQuantity: true },
  });
  return lines.reduce((acc, l) => acc + Math.max(0, l.quantity - l.receivedQuantity), 0);
}

/** Position broken down by issuer — the Monavate versus FAB split. */
export async function getIssuerBreakdown() {
  const issuers = await prisma.issuer.findMany({ orderBy: { name: 'asc' } });
  const grouped = await prisma.card.groupBy({ by: ['cardTypeId', 'status'], _count: { _all: true } });
  const types = await prisma.cardType.findMany({ select: { id: true, issuerId: true } });
  const issuerOfType = new Map(types.map((t) => [t.id, t.issuerId]));

  return issuers.map((issuer) => {
    let onHand = 0;
    let registered = 0;
    let total = 0;
    for (const g of grouped) {
      if (issuerOfType.get(g.cardTypeId) !== issuer.id) continue;
      total += g._count._all;
      if ((ON_HAND_STATUSES as readonly string[]).includes(g.status)) onHand += g._count._all;
      if (g.status === 'REGISTERED') registered += g._count._all;
    }
    return { id: issuer.id, code: issuer.code, name: issuer.name, onHand, registered, total };
  });
}

/** Deliveries dispatched but never confirmed as received. */
export async function getOpenDeliveries() {
  return prisma.delivery.findMany({
    where: { status: 'DISPATCHED' },
    include: {
      toLocation: { select: { name: true } },
      fromLocation: { select: { name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { dispatchedAt: 'asc' },
  });
}

export async function getOpenOrders() {
  return prisma.cardOrder.findMany({
    where: { status: { in: [...OPEN_ORDER_STATUSES] } },
    include: {
      client: { select: { name: true } },
      issuer: { select: { name: true } },
      lines: { select: { quantity: true, receivedQuantity: true } },
    },
    orderBy: { orderedAt: 'asc' },
  });
}

/**
 * Cards marked in transit that no open delivery accounts for — typically short
 * deliveries whose shipment was closed around them. Nothing else in the app
 * would chase these, and they are exactly the stock most likely to be quietly
 * lost when you cannot go and look.
 */
export async function getStrandedInTransit() {
  return prisma.card.findMany({
    where: {
      status: 'IN_TRANSIT',
      NOT: { deliveryLines: { some: { delivery: { status: 'DISPATCHED' } } } },
    },
    include: {
      location: { select: { name: true } },
      client: { select: { name: true } },
      deliveryLines: {
        include: { delivery: { select: { id: true, reference: true, toLocation: { select: { name: true } } } } },
        orderBy: { id: 'desc' },
        take: 1,
      },
    },
    take: 50,
  });
}
