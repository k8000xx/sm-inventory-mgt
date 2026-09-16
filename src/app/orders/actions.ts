'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ORDER_STATUSES } from '@/lib/constants';
import { receiveOrderLine, receiveWholeOrder } from '@/lib/orders';
import { parseSerialRange } from '@/lib/serials';

export type ActionState = { error?: string; success?: string };

const lineSchema = z.object({
  cardTypeId: z.string().trim().min(1),
  serialStart: z.string().trim().min(1),
  serialEnd: z.string().trim().min(1),
  batchRef: z.string().trim().max(80).optional(),
  expiryDate: z.string().trim().optional(),
  notes: z.string().trim().max(500).optional(),
});

const orderSchema = z.object({
  clientId: z.string().trim().min(1, 'Choose the client this order is for'),
  issuerId: z.string().trim().min(1, 'Choose the issuer'),
  deliverToLocationId: z.string().trim().min(1, 'Choose where the cards will be delivered'),
  reference: z.string().trim().max(60).optional(),
  orderedAt: z.string().trim().min(1, 'An order date is required'),
  expectedAt: z.string().trim().optional(),
  placedBy: z.string().trim().max(80).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function createOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = orderSchema.safeParse({
    clientId: formData.get('clientId'),
    issuerId: formData.get('issuerId'),
    deliverToLocationId: formData.get('deliverToLocationId'),
    reference: formData.get('reference') || undefined,
    orderedAt: formData.get('orderedAt'),
    expectedAt: formData.get('expectedAt') || undefined,
    placedBy: formData.get('placedBy') || undefined,
    status: (formData.get('status') as string) || undefined,
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let rawLines: unknown;
  try {
    rawLines = JSON.parse(String(formData.get('lines') ?? '[]'));
  } catch {
    return { error: 'The order lines could not be read.' };
  }
  const linesParsed = z.array(lineSchema).min(1, 'Add at least one order line').safeParse(rawLines);
  if (!linesParsed.success) return { error: linesParsed.error.issues[0].message };

  // Every line's range has to make sense before anything is written, so a bad
  // range is reported against its own line rather than failing halfway through.
  const prepared: {
    cardTypeId: string;
    serialStart: string;
    serialEnd: string;
    quantity: number;
    batchRef: string | null;
    expiryDate: Date | null;
    notes: string | null;
  }[] = [];

  for (const [i, line] of linesParsed.data.entries()) {
    const range = parseSerialRange(line.serialStart, line.serialEnd);
    if (!range.ok) return { error: `Line ${i + 1}: ${range.error}` };

    let expiryDate: Date | null = null;
    if (line.expiryDate) {
      const d = new Date(line.expiryDate);
      if (Number.isNaN(d.getTime())) return { error: `Line ${i + 1}: the expiry date is not valid.` };
      expiryDate = d;
    }

    prepared.push({
      cardTypeId: line.cardTypeId,
      serialStart: line.serialStart.trim(),
      serialEnd: line.serialEnd.trim(),
      quantity: range.info.count,
      batchRef: line.batchRef ?? null,
      expiryDate,
      notes: line.notes ?? null,
    });
  }

  const orderedAt = new Date(parsed.data.orderedAt);
  if (Number.isNaN(orderedAt.getTime())) return { error: 'The order date is not valid.' };

  const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
  if (!client) return { error: 'That client no longer exists.' };

  const reference =
    parsed.data.reference ||
    `ORD-${client.code}-${orderedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

  const clash = await prisma.cardOrder.findUnique({ where: { reference } });
  if (clash) return { error: `Reference "${reference}" is already used.` };

  const expectedAt = parsed.data.expectedAt ? new Date(parsed.data.expectedAt) : null;
  if (expectedAt && Number.isNaN(expectedAt.getTime())) return { error: 'The expected date is not valid.' };

  const order = await prisma.cardOrder.create({
    data: {
      reference,
      clientId: parsed.data.clientId,
      issuerId: parsed.data.issuerId,
      deliverToLocationId: parsed.data.deliverToLocationId,
      status: parsed.data.status ?? 'SUBMITTED',
      orderedAt,
      expectedAt,
      placedBy: parsed.data.placedBy || 'HQ',
      notes: parsed.data.notes ?? null,
      lines: { create: prepared },
    },
  });

  revalidatePath('/orders');
  revalidatePath('/');
  redirect(`/orders/${order.id}`);
}

export async function setOrderStatus(id: string, status: string): Promise<void> {
  const valid = z.enum(ORDER_STATUSES).safeParse(status);
  if (!valid.success) return;
  await prisma.cardOrder.update({ where: { id }, data: { status: valid.data } });
  revalidatePath(`/orders/${id}`);
  revalidatePath('/orders');
  revalidatePath('/');
}

export async function receiveLineAction(
  lineId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = String(formData.get('actor') ?? '').trim() || 'HQ';
  const qtyRaw = Number(formData.get('quantity'));
  const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : undefined;

  const receivedRaw = String(formData.get('receivedAt') ?? '');
  const receivedAt = receivedRaw ? new Date(receivedRaw) : new Date();
  if (Number.isNaN(receivedAt.getTime())) return { error: 'The received date is not valid.' };

  try {
    const result = await receiveOrderLine({ lineId, quantity, actor, receivedAt });
    revalidatePath('/orders');
    revalidatePath('/cards');
    revalidatePath('/');

    const skipped = result.skipped > 0 ? ` ${result.skipped} serial(s) were already on file and were skipped.` : '';
    return { success: `Booked in ${result.created} card(s).${skipped}` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function receiveAllAction(
  orderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = String(formData.get('actor') ?? '').trim() || 'HQ';
  const receivedRaw = String(formData.get('receivedAt') ?? '');
  const receivedAt = receivedRaw ? new Date(receivedRaw) : new Date();
  if (Number.isNaN(receivedAt.getTime())) return { error: 'The received date is not valid.' };

  try {
    const result = await receiveWholeOrder({ orderId, actor, receivedAt });
    if (result.lines === 0) return { error: 'Every line on this order has already been received.' };

    revalidatePath('/orders');
    revalidatePath('/cards');
    revalidatePath('/');

    const skipped = result.skipped > 0 ? ` ${result.skipped} duplicate serial(s) skipped.` : '';
    return { success: `Booked in ${result.created} card(s) across ${result.lines} line(s).${skipped}` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function cancelOrder(id: string): Promise<void> {
  const received = await prisma.cardOrderLine.aggregate({
    where: { orderId: id },
    _sum: { receivedQuantity: true },
  });
  // Once stock has been booked in against an order, cancelling it would orphan
  // real cards, so the order stays and only its remaining lines are abandoned.
  if ((received._sum.receivedQuantity ?? 0) > 0) return;

  await prisma.cardOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  revalidatePath('/orders');
  revalidatePath(`/orders/${id}`);
  revalidatePath('/');
}

export async function deleteDraftOrder(id: string): Promise<void> {
  const order = await prisma.cardOrder.findUnique({
    where: { id },
    include: { lines: { select: { receivedQuantity: true } } },
  });
  if (!order) return;
  if (order.lines.some((l) => l.receivedQuantity > 0)) return;
  if (order.status !== 'DRAFT' && order.status !== 'CANCELLED') return;

  await prisma.cardOrder.delete({ where: { id } });
  revalidatePath('/orders');
  redirect('/orders');
}

