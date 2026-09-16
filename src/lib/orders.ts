import { prisma } from '@/lib/db';
import type { TxClient } from '@/lib/inventory';
import { createCardWithMovement } from '@/lib/inventory';
import { expandRange, parseSerialRange } from '@/lib/serials';

export type ReceiveResult = {
  created: number;
  skipped: number;
  skippedSerials: string[];
  lineComplete: boolean;
  orderStatus: string;
};

/**
 * Receiving an order line is the only way new stock enters the system. The
 * line's serial range is expanded from wherever the last receipt stopped, so a
 * part-shipment can be booked in now and the rest later without double-creating.
 *
 * Serials already present are skipped rather than failing the whole receipt —
 * issuers do resend overlapping ranges — and reported back so the operator sees it.
 */
export async function receiveOrderLine(input: {
  lineId: string;
  quantity?: number;
  actor: string;
  receivedAt?: Date;
  notes?: string | null;
}): Promise<ReceiveResult> {
  const { lineId, actor, notes } = input;
  const receivedAt = input.receivedAt ?? new Date();

  return prisma.$transaction(
    async (tx) => {
      const line = await tx.cardOrderLine.findUnique({
        where: { id: lineId },
        include: { order: true, cardType: true },
      });
      if (!line) throw new Error('Order line not found.');
      if (line.order.status === 'CANCELLED') throw new Error('This order has been cancelled.');

      const remaining = line.quantity - line.receivedQuantity;
      if (remaining <= 0) throw new Error('This line has already been received in full.');

      const take = Math.min(input.quantity && input.quantity > 0 ? input.quantity : remaining, remaining);

      const parsed = parseSerialRange(line.serialStart, line.serialEnd);
      if (!parsed.ok) throw new Error(`The serial range on this line is invalid: ${parsed.error}`);

      const serials = expandRange(parsed.info, line.receivedQuantity, take);

      // Anything already on file is skipped, not overwritten.
      const existing = await tx.card.findMany({
        where: { serial: { in: serials } },
        select: { serial: true },
      });
      const taken = new Set(existing.map((c) => c.serial));

      let created = 0;
      for (const serial of serials) {
        if (taken.has(serial)) continue;
        await createCardWithMovement(
          tx,
          {
            serial,
            cardTypeId: line.cardTypeId,
            clientId: line.order.clientId,
            locationId: line.order.deliverToLocationId,
            orderLineId: line.id,
            status: 'IN_STOCK',
            batchRef: line.batchRef,
            expiryDate: line.expiryDate,
            // Booked in against a delivery note, which counts as HQ having seen them.
            lastVerifiedAt: receivedAt,
            lastVerifiedBy: actor,
          },
          {
            type: 'ORDER_RECEIPT',
            actor,
            reference: line.order.reference,
            occurredAt: receivedAt,
            cardOrderId: line.orderId,
            notes: notes ?? `Received against order ${line.order.reference}`,
          },
        );
        created += 1;
      }

      // The counter tracks how far down the range we have booked in, including
      // serials skipped as duplicates — otherwise a re-receipt would loop forever.
      const receivedQuantity = line.receivedQuantity + serials.length;
      await tx.cardOrderLine.update({
        where: { id: line.id },
        data: { receivedQuantity },
      });

      const orderStatus = await recomputeOrderStatus(tx, line.orderId, receivedAt);

      return {
        created,
        skipped: serials.length - created,
        skippedSerials: serials.filter((s) => taken.has(s)).slice(0, 50),
        lineComplete: receivedQuantity >= line.quantity,
        orderStatus,
      };
    },
    { maxWait: 15_000, timeout: 300_000 },
  );
}

/** Keep the order header in step with its lines. */
export async function recomputeOrderStatus(
  tx: TxClient,
  orderId: string,
  receivedAt?: Date,
): Promise<string> {
  const lines = await tx.cardOrderLine.findMany({ where: { orderId } });
  const ordered = lines.reduce((a, l) => a + l.quantity, 0);
  const received = lines.reduce((a, l) => a + l.receivedQuantity, 0);

  const order = await tx.cardOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status === 'CANCELLED') return order?.status ?? 'CANCELLED';

  let status = order.status;
  if (received === 0) {
    // Leave pre-receipt statuses (draft, submitted, in production, shipped) alone.
    status = order.status === 'PARTIALLY_RECEIVED' || order.status === 'RECEIVED' ? 'SHIPPED' : order.status;
  } else if (received >= ordered) {
    status = 'RECEIVED';
  } else {
    status = 'PARTIALLY_RECEIVED';
  }

  await tx.cardOrder.update({
    where: { id: orderId },
    data: {
      status,
      receivedAt: status === 'RECEIVED' ? order.receivedAt ?? receivedAt ?? new Date() : null,
    },
  });

  return status;
}

/** Receive every outstanding line on an order in one go. */
export async function receiveWholeOrder(input: {
  orderId: string;
  actor: string;
  receivedAt?: Date;
}): Promise<{ created: number; skipped: number; lines: number }> {
  const lines = await prisma.cardOrderLine.findMany({
    where: { orderId: input.orderId },
    orderBy: { createdAt: 'asc' },
  });

  let created = 0;
  let skipped = 0;
  let touched = 0;

  for (const line of lines) {
    if (line.receivedQuantity >= line.quantity) continue;
    const result = await receiveOrderLine({
      lineId: line.id,
      actor: input.actor,
      receivedAt: input.receivedAt,
    });
    created += result.created;
    skipped += result.skipped;
    touched += 1;
  }

  return { created, skipped, lines: touched };
}
