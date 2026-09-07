'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(40),
  name: z.string().trim().min(1, 'Name is required').max(120),
  currency: z.string().trim().length(3, 'Use a 3-letter currency code').toUpperCase(),
  description: z.string().trim().max(500).optional(),
});

export type ActionState = { error?: string; success?: string };

export async function createCardType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    currency: formData.get('currency') || 'USD',
    description: formData.get('description') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const exists = await prisma.cardType.findUnique({ where: { code: parsed.data.code } });
  if (exists) return { error: `Card type code "${parsed.data.code}" is already in use.` };

  await prisma.cardType.create({ data: parsed.data });
  revalidatePath('/card-types');
  return { success: `Added ${parsed.data.name}.` };
}

export async function toggleCardType(id: string, isActive: boolean): Promise<void> {
  await prisma.cardType.update({ where: { id }, data: { isActive } });
  revalidatePath('/card-types');
}
