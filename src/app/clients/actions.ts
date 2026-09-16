'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(40),
  name: z.string().trim().min(1, 'Name is required').max(160),
  registeredNo: z.string().trim().max(60).optional(),
  country: z.string().trim().max(80).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email('Contact email is not valid').max(160).optional().or(z.literal('')),
  contactPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type ActionState = { error?: string; success?: string };

function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  return {
    code: formData.get('code'),
    name: formData.get('name'),
    registeredNo: get('registeredNo'),
    country: get('country'),
    contactName: get('contactName'),
    contactEmail: formData.get('contactEmail') || '',
    contactPhone: get('contactPhone'),
    notes: get('notes'),
  };
}

export async function createClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(readForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const exists = await prisma.client.findUnique({ where: { code: parsed.data.code } });
  if (exists) return { error: `Client code "${parsed.data.code}" is already in use.` };

  const { contactEmail, ...rest } = parsed.data;
  await prisma.client.create({ data: { ...rest, contactEmail: contactEmail || null } });
  revalidatePath('/clients');
  revalidatePath('/');
  return { success: `Added ${parsed.data.name}.` };
}

export async function updateClient(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(readForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const clash = await prisma.client.findFirst({ where: { code: parsed.data.code, NOT: { id } } });
  if (clash) return { error: `Client code "${parsed.data.code}" is already in use.` };

  const { contactEmail, ...rest } = parsed.data;
  await prisma.client.update({ where: { id }, data: { ...rest, contactEmail: contactEmail || null } });
  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
  return { success: 'Saved.' };
}

export async function setClientActive(id: string, isActive: boolean): Promise<void> {
  await prisma.client.update({ where: { id }, data: { isActive } });
  revalidatePath('/clients');
}
