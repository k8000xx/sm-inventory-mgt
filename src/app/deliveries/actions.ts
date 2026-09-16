'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { cancelDelivery, confirmDeliveryReceipt, dispatchDelivery } from '@/lib/deliveries';
import { ON_HAND_STATUSES } from '@/lib/constants';

export type ActionState = { error?: string; success?: string };

const createSchema = z.object({
  fromLocationId: z.string().trim().min(1, 'Choose where the cards are shipping from'),
  toLocationId: z.string().trim().min(1, 'Choose the destination'),
  reference: z.string().trim().max(60).optional(),
  expectedAt: z.string().trim().optional(),
  carrier: z.string().trim().max(120).optional(),
  trackingRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Build a delivery from a selection of cards. Only stock actually on hand at the
 * source can be shipped, which stops a card being sent from two places at once.
 */
export async function createDelivery(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    fromLocationId: formData.get('fromLocationId'),
    toLocationId: formData.get('toLocationId'),
    reference: formData.get('reference') || undefined,
    expectedAt: formData.get('expectedAt') || undefined,
    carrier: formData.get('carrier') || undefined,
    trackingRef: formData.get('trackingRef') || undefined,
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.fromLocationId === d.toLocationId) {
    return { error: 'The source and destination must be different locations.' };
  }

  const cardIds = formData.getAll('cardIds').map(String).filter(Boolean);
  const serialList = formData.getAll('serialList').map(String).map((v) => v.trim()).filter(Boolean);
  const quantityRaw = Number(formData.get('quantity'));
  const cardTypeId = String(formData.get('cardTypeId') ?? '');

  const [from, to] = await Promise.all([
    prisma.location.findUnique({ where: { id: d.fromLocationId } }),
    prisma.location.findUnique({ where: { id: d.toLocationId } }),
  ]);
  if (!from || !to) return { error: 'One of those locations no longer exists.' };

  // Either an explicit selection, or "the next N of this product from stock".
  let cards: { id: string; clientId: string | null }[];
  if (serialList.length > 0) {
    cards = await prisma.card.findMany({
      where: { serial: { in: serialList }, locationId: d.fromLocationId, status: { in: ON_HAND_STATUSES } },
      select: { id: true, clientId: true },
    });
    if (cards.length === 0) {
      return { error: `None of those serials are on hand at ${from.name}.` };
    }
  } else if (cardIds.length > 0) {
    cards = await prisma.card.findMany({
      where: { id: { in: cardIds }, locationId: d.fromLocationId, status: { in: ON_HAND_STATUSES } },
      select: { id: true, clientId: true },
    });
    if (cards.length === 0) {
      return { error: 'None of the selected cards are currently on hand at the source location.' };
    }
  } else {
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 0;
    if (quantity === 0) return { error: 'Choose how many cards to send, or select them individually.' };

    cards = await prisma.card.findMany({
      where: {
        locationId: d.fromLocationId,
        status: { in: ON_HAND_STATUSES },
        ...(cardTypeId ? { cardTypeId } : {}),
        ...(to.clientId ? { clientId: to.clientId } : {}),
      },
      select: { id: true, clientId: true },
      orderBy: { serial: 'asc' },
      take: quantity,
    });

    if (cards.length === 0) {
      return {
        error: to.clientId
          ? `No cards belonging to that client are on hand at ${from.name}.`
          : `No cards are on hand at ${from.name}.`,
      };
    }
  }

  const expectedAt = d.expectedAt ? new Date(d.expectedAt) : null;
  if (expectedAt && Number.isNaN(expectedAt.getTime())) return { error: 'The expected date is not valid.' };

  const reference =
    d.reference || `DLV-${to.code}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

  const clash = await prisma.delivery.findUnique({ where: { reference } });
  if (clash) return { error: `Reference "${reference}" is already used.` };

  // A delivery carries one client's stock; take it from the cards themselves.
  const clientIds = new Set(cards.map((c) => c.clientId).filter(Boolean));
  const clientId = clientIds.size === 1 ? [...clientIds][0]! : null;

  const delivery = await prisma.delivery.create({
    data: {
      reference,
      clientId,
      fromLocationId: d.fromLocationId,
      toLocationId: d.toLocationId,
      expectedAt,
      carrier: d.carrier ?? null,
      trackingRef: d.trackingRef ?? null,
      notes: d.notes ?? null,
      lines: { create: cards.map((c) => ({ cardId: c.id })) },
    },
  });

  revalidatePath('/deliveries');
  redirect(`/deliveries/${delivery.id}`);
}

export async function dispatchAction(
  deliveryId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = String(formData.get('actor') ?? '').trim() || 'HQ';
  const raw = String(formData.get('dispatchedAt') ?? '');
  const dispatchedAt = raw ? new Date(raw) : new Date();
  if (Number.isNaN(dispatchedAt.getTime())) return { error: 'The dispatch date is not valid.' };

  try {
    const moved = await dispatchDelivery({ deliveryId, actor, dispatchedAt });
    revalidatePath('/deliveries');
    revalidatePath(`/deliveries/${deliveryId}`);
    revalidatePath('/cards');
    revalidatePath('/');
    return { success: `Dispatched ${moved} card(s). They stay on the sender's books until receipt is confirmed.` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function confirmReceiptAction(
  deliveryId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = String(formData.get('actor') ?? '').trim();
  if (!actor) return { error: 'Record who confirmed receipt onboard.' };

  const raw = String(formData.get('receivedAt') ?? '');
  const receivedAt = raw ? new Date(raw) : new Date();
  if (Number.isNaN(receivedAt.getTime())) return { error: 'The received date is not valid.' };

  const receivedCardIds = formData.getAll('receivedCardIds').map(String).filter(Boolean);
  if (receivedCardIds.length === 0) {
    return { error: 'Tick the cards that actually arrived. If none did, cancel the delivery instead.' };
  }

  try {
    const result = await confirmDeliveryReceipt({
      deliveryId,
      receivedCardIds,
      actor,
      receivedAt,
      notes: String(formData.get('notes') ?? '') || null,
    });
    revalidatePath('/deliveries');
    revalidatePath(`/deliveries/${deliveryId}`);
    revalidatePath('/cards');
    revalidatePath('/');

    const short = result.shortDelivered > 0 ? ` ${result.shortDelivered} card(s) were not received and remain in transit.` : '';
    return { success: `Confirmed ${result.received} card(s) onboard.${short}` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function cancelDeliveryAction(deliveryId: string): Promise<void> {
  try {
    await cancelDelivery({ deliveryId, actor: 'HQ' });
  } catch {
    // A received delivery cannot be cancelled; the page will reflect that.
  }
  revalidatePath('/deliveries');
  revalidatePath(`/deliveries/${deliveryId}`);
  revalidatePath('/cards');
}
