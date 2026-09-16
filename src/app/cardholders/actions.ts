'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({
  clientId: z.string().trim().min(1, 'Choose the client this person works for'),
  ref: z.string().trim().min(1, 'A crew or employee reference is required').max(60),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  rank: z.string().trim().max(60).optional(),
  nationality: z.string().trim().max(60).optional(),
  email: z.string().trim().email('Email is not valid').max(160).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  locationId: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type ActionState = { error?: string; success?: string };

function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  return {
    clientId: formData.get('clientId'),
    ref: formData.get('ref'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    rank: get('rank'),
    nationality: get('nationality'),
    email: formData.get('email') || '',
    phone: get('phone'),
    locationId: get('locationId'),
    notes: get('notes'),
  };
}

export async function createCardholder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(readForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // A crew reference only has to be unique within the client that issued it.
  const clash = await prisma.cardholder.findFirst({ where: { clientId: d.clientId, ref: d.ref } });
  if (clash) return { error: `Reference "${d.ref}" is already used by another cardholder for this client.` };

  const created = await prisma.cardholder.create({
    data: {
      ...d,
      email: d.email || null,
      locationId: d.locationId || null,
    },
  });

  revalidatePath('/cardholders');
  redirect(`/cardholders/${created.id}`);
}

export async function updateCardholder(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse(readForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const clash = await prisma.cardholder.findFirst({
    where: { clientId: d.clientId, ref: d.ref, NOT: { id } },
  });
  if (clash) return { error: `Reference "${d.ref}" is already used by another cardholder for this client.` };

  await prisma.cardholder.update({
    where: { id },
    data: { ...d, email: d.email || null, locationId: d.locationId || null },
  });

  revalidatePath('/cardholders');
  revalidatePath(`/cardholders/${id}`);
  return { success: 'Saved.' };
}

export async function setCardholderActive(id: string, isActive: boolean): Promise<void> {
  await prisma.cardholder.update({ where: { id }, data: { isActive } });
  revalidatePath('/cardholders');
  revalidatePath(`/cardholders/${id}`);
}
