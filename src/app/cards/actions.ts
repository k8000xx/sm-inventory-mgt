'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { CARD_STATUSES } from '@/lib/constants';
import { maskPan } from '@/lib/format';
import { applyCardChange, createCardWithMovement, setCardStatuses, transferCards } from '@/lib/inventory';

export type ActionState = { error?: string; success?: string };

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), 'Invalid date');

const cardSchema = z.object({
  serial: z.string().trim().min(1, 'Serial is required').max(80),
  cardTypeId: z.string().trim().min(1, 'Card type is required'),
  status: z.enum(CARD_STATUSES),
  locationId: z.string().trim().optional(),
  proxy: z.string().trim().max(80).optional(),
  pan: z.string().trim().max(40).optional(),
  batchRef: z.string().trim().max(80).optional(),
  issuedTo: z.string().trim().max(160).optional(),
  expiryDate: optionalDate,
  issuedAt: optionalDate,
  activatedAt: optionalDate,
  notes: z.string().trim().max(1000).optional(),
  actor: z.string().trim().max(80).optional(),
});

function readCardForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  return {
    serial: formData.get('serial'),
    cardTypeId: formData.get('cardTypeId'),
    status: formData.get('status'),
    locationId: get('locationId'),
    proxy: get('proxy'),
    pan: get('pan'),
    batchRef: get('batchRef'),
    issuedTo: get('issuedTo'),
    expiryDate: get('expiryDate'),
    issuedAt: get('issuedAt'),
    activatedAt: get('activatedAt'),
    notes: get('notes'),
    actor: get('actor'),
  };
}

export async function createCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cardSchema.safeParse(readCardForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const exists = await prisma.card.findUnique({ where: { serial: d.serial } });
  if (exists) return { error: `A card with serial "${d.serial}" already exists.` };

  let newId = '';
  await prisma.$transaction(async (tx) => {
    const card = await createCardWithMovement(
      tx,
      {
        serial: d.serial,
        cardTypeId: d.cardTypeId,
        status: d.status,
        locationId: d.locationId || null,
        proxy: d.proxy ?? null,
        maskedPan: maskPan(d.pan),
        batchRef: d.batchRef ?? null,
        expiryDate: d.expiryDate,
        issuedTo: d.issuedTo ?? null,
        issuedAt: d.issuedAt,
        activatedAt: d.activatedAt,
        notes: d.notes ?? null,
        // Entered by hand at HQ, so nobody has physically confirmed it yet.
        lastVerifiedAt: null,
        lastVerifiedBy: null,
      },
      { type: 'RECEIPT', actor: d.actor || 'HQ', notes: 'Created manually' },
    );
    newId = card.id;
  });

  revalidatePath('/cards');
  revalidatePath('/');
  redirect(`/cards/${newId}`);
}

export async function updateCard(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = cardSchema.safeParse(readCardForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const card = await prisma.card.findUnique({ where: { id } });
  if (!card) return { error: 'Card not found.' };

  if (d.serial !== card.serial) {
    const clash = await prisma.card.findUnique({ where: { serial: d.serial } });
    if (clash) return { error: `A card with serial "${d.serial}" already exists.` };
    await prisma.card.update({ where: { id }, data: { serial: d.serial } });
  }

  const changed = await prisma.$transaction((tx) =>
    applyCardChange(
      tx,
      { ...card, serial: d.serial },
      {
        cardTypeId: d.cardTypeId,
        status: d.status,
        locationId: d.locationId || null,
        proxy: d.proxy ?? null,
        maskedPan: maskPan(d.pan) ?? card.maskedPan,
        batchRef: d.batchRef ?? null,
        expiryDate: d.expiryDate,
        issuedTo: d.issuedTo ?? null,
        issuedAt: d.issuedAt,
        activatedAt: d.activatedAt,
        notes: d.notes ?? null,
      },
      { type: 'ADJUSTMENT', actor: d.actor || 'HQ', notes: 'Edited manually' },
    ),
  );

  revalidatePath(`/cards/${id}`);
  revalidatePath('/cards');
  revalidatePath('/');
  return { success: changed ? 'Card updated.' : 'No changes to save.' };
}

const bulkSchema = z.object({
  cardIds: z.array(z.string()).min(1, 'Select at least one card.'),
  actor: z.string().trim().max(80).default('HQ'),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function bulkTransfer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const base = bulkSchema.safeParse({
    cardIds: formData.getAll('cardIds').map(String),
    actor: formData.get('actor') || 'HQ',
    reference: formData.get('reference') || undefined,
    notes: formData.get('notes') || undefined,
  });
  if (!base.success) return { error: base.error.issues[0].message };

  const toLocationId = String(formData.get('toLocationId') ?? '');
  if (!toLocationId) return { error: 'Choose a destination location.' };

  const count = await transferCards({
    cardIds: base.data.cardIds,
    toLocationId,
    actor: base.data.actor,
    reference: base.data.reference,
    notes: base.data.notes,
    markInTransit: formData.get('markInTransit') === 'on',
  });

  revalidatePath('/cards');
  revalidatePath('/');
  return { success: `Moved ${count} card(s).` };
}

export async function bulkStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const base = bulkSchema.safeParse({
    cardIds: formData.getAll('cardIds').map(String),
    actor: formData.get('actor') || 'HQ',
    reference: formData.get('reference') || undefined,
    notes: formData.get('notes') || undefined,
  });
  if (!base.success) return { error: base.error.issues[0].message };

  const statusRaw = String(formData.get('status') ?? '');
  const status = z.enum(CARD_STATUSES).safeParse(statusRaw);
  if (!status.success) return { error: 'Choose a valid status.' };

  const count = await setCardStatuses({
    cardIds: base.data.cardIds,
    status: status.data,
    actor: base.data.actor,
    reference: base.data.reference,
    notes: base.data.notes,
  });

  revalidatePath('/cards');
  revalidatePath('/');
  return { success: `Updated ${count} card(s).` };
}
