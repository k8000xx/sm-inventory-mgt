import { prisma } from '@/lib/db';
import { applyCardChange } from '@/lib/inventory';

/**
 * A delivery is two-step on purpose. Dispatching marks the cards IN_TRANSIT but
 * leaves them on the sending location's books until somebody at the destination
 * confirms receipt — so a shipment that never arrives stays visible as in-transit
 * rather than quietly appearing as stock on a vessel that never got it.
 */
export async function dispatchDelivery(input: {
  deliveryId: string;
  actor: string;
  dispatchedAt?: Date;
}): Promise<number> {
  const { deliveryId, actor } = input;
  const dispatchedAt = input.dispatchedAt ?? new Date();

  return prisma.$transaction(
    async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: { lines: true },
      });
      if (!delivery) throw new Error('Delivery not found.');
      if (delivery.status !== 'DRAFT') throw new Error('Only a draft delivery can be dispatched.');
      if (delivery.lines.length === 0) throw new Error('This delivery has no cards on it.');

      const cards = await tx.card.findMany({
        where: { id: { in: delivery.lines.map((l) => l.cardId) } },
      });

      let moved = 0;
      for (const card of cards) {
        const result = await applyCardChange(
          tx,
          card,
          { status: 'IN_TRANSIT' },
          {
            type: 'DELIVERY_DISPATCH',
            actor,
            reference: delivery.reference,
            occurredAt: dispatchedAt,
            deliveryId: delivery.id,
            notes: `Dispatched on ${delivery.reference}`,
          },
        );
        if (result) moved += 1;
      }

      await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: 'DISPATCHED', dispatchedAt, dispatchedBy: actor },
      });

      return moved;
    },
    { maxWait: 15_000, timeout: 300_000 },
  );
}

export type ReceiptResult = { received: number; shortDelivered: number };

/**
 * Confirm what actually turned up. Cards named as received land on the
 * destination's books and count as physically verified — somebody had them in
 * their hands. Anything not named stays IN_TRANSIT and is flagged short.
 */
export async function confirmDeliveryReceipt(input: {
  deliveryId: string;
  receivedCardIds: string[];
  actor: string;
  receivedAt?: Date;
  notes?: string | null;
}): Promise<ReceiptResult> {
  const { deliveryId, actor, notes } = input;
  const receivedAt = input.receivedAt ?? new Date();
  const receivedSet = new Set(input.receivedCardIds);

  return prisma.$transaction(
    async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: { lines: true, toLocation: true },
      });
      if (!delivery) throw new Error('Delivery not found.');
      if (delivery.status !== 'DISPATCHED') {
        throw new Error('Only a dispatched delivery can be confirmed as received.');
      }

      const cards = await tx.card.findMany({
        where: { id: { in: delivery.lines.map((l) => l.cardId) } },
      });

      let received = 0;
      for (const card of cards) {
        if (!receivedSet.has(card.id)) continue;
        await applyCardChange(
          tx,
          card,
          {
            locationId: delivery.toLocationId,
            status: 'IN_STOCK',
            deliveredAt: receivedAt,
            verified: { by: actor, at: receivedAt },
          },
          {
            type: 'DELIVERY_RECEIPT',
            actor,
            reference: delivery.reference,
            occurredAt: receivedAt,
            deliveryId: delivery.id,
            notes: notes ?? `Received onboard ${delivery.toLocation.name}`,
          },
        );
        received += 1;
      }

      for (const line of delivery.lines) {
        const isReceived = receivedSet.has(line.cardId);
        await tx.deliveryLine.update({
          where: { id: line.id },
          data: {
            received: isReceived,
            note: isReceived ? null : 'Not received — still in transit',
          },
        });
      }

      await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: 'RECEIVED', receivedAt, receivedBy: actor },
      });

      return { received, shortDelivered: delivery.lines.length - received };
    },
    { maxWait: 15_000, timeout: 300_000 },
  );
}

/** Pull a delivery back before it ships, returning its cards to stock. */
export async function cancelDelivery(input: {
  deliveryId: string;
  actor: string;
}): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.findUnique({
      where: { id: input.deliveryId },
      include: { lines: true },
    });
    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.status === 'RECEIVED') {
      throw new Error('This delivery has already been received and cannot be cancelled.');
    }

    let returned = 0;
    if (delivery.status === 'DISPATCHED') {
      const cards = await tx.card.findMany({
        where: { id: { in: delivery.lines.map((l) => l.cardId) }, status: 'IN_TRANSIT' },
      });
      for (const card of cards) {
        const result = await applyCardChange(
          tx,
          card,
          { status: 'IN_STOCK' },
          {
            type: 'ADJUSTMENT',
            actor: input.actor,
            reference: delivery.reference,
            deliveryId: delivery.id,
            notes: `Delivery ${delivery.reference} cancelled — returned to stock`,
          },
        );
        if (result) returned += 1;
      }
    }

    await tx.delivery.update({ where: { id: input.deliveryId }, data: { status: 'CANCELLED' } });
    return returned;
  });
}
