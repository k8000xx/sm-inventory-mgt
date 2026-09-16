'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { LOCATION_TYPES } from '@/lib/constants';

const schema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(40),
  name: z.string().trim().min(1, 'Name is required').max(160),
  type: z.enum(LOCATION_TYPES),
  clientId: z.string().trim().optional(),
  region: z.string().trim().max(80).optional(),
  vesselImo: z.string().trim().max(40).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email('Contact email is not valid').max(160).optional().or(z.literal('')),
  reorderPoint: z.coerce.number().int().min(0).max(1_000_000),
  countIntervalDays: z.coerce.number().int().min(1).max(3650),
  notes: z.string().trim().max(1000).optional(),
});

export type ActionState = { error?: string; success?: string };

function readForm(formData: FormData) {
  return {
    code: formData.get('code'),
    name: formData.get('name'),
    type: formData.get('type'),
    clientId: formData.get('clientId') || undefined,
    region: formData.get('region') || undefined,
    vesselImo: formData.get('vesselImo') || undefined,
    contactName: formData.get('contactName') || undefined,
    contactEmail: formData.get('contactEmail') || '',
    reorderPoint: formData.get('reorderPoint') || 0,
    countIntervalDays: formData.get('countIntervalDays') || 90,
    notes: formData.get('notes') || undefined,
  };
}

export async function createLocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(readForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const exists = await prisma.location.findUnique({ where: { code: parsed.data.code } });
  if (exists) return { error: `Location code "${parsed.data.code}" is already in use.` };

  const { contactEmail, clientId, ...rest } = parsed.data;
  await prisma.location.create({
    data: { ...rest, contactEmail: contactEmail || null, clientId: clientId || null },
  });
  revalidatePath('/locations');
  revalidatePath('/');
  return { success: `Added ${parsed.data.name}.` };
}

export async function updateLocation(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse(readForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const clash = await prisma.location.findFirst({
    where: { code: parsed.data.code, NOT: { id } },
  });
  if (clash) return { error: `Location code "${parsed.data.code}" is already in use.` };

  const { contactEmail, clientId, ...rest } = parsed.data;
  await prisma.location.update({
    where: { id },
    data: { ...rest, contactEmail: contactEmail || null, clientId: clientId || null },
  });
  revalidatePath('/locations');
  revalidatePath(`/locations/${id}`);
  revalidatePath('/');
  return { success: 'Saved.' };
}

export async function setLocationActive(id: string, isActive: boolean): Promise<void> {
  await prisma.location.update({ where: { id }, data: { isActive } });
  revalidatePath('/locations');
  revalidatePath('/');
}
