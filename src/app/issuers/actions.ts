'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(40),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(500).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email('Contact email is not valid').max(160).optional().or(z.literal('')),
});

export type ActionState = { error?: string; success?: string };

export async function createIssuer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    contactName: formData.get('contactName') || undefined,
    contactEmail: formData.get('contactEmail') || '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const exists = await prisma.issuer.findUnique({ where: { code: parsed.data.code } });
  if (exists) return { error: `Issuer code "${parsed.data.code}" is already in use.` };

  const { contactEmail, ...rest } = parsed.data;
  await prisma.issuer.create({ data: { ...rest, contactEmail: contactEmail || null } });
  revalidatePath('/issuers');
  revalidatePath('/card-types');
  return { success: `Added ${parsed.data.name}.` };
}

export async function toggleIssuer(id: string, isActive: boolean): Promise<void> {
  await prisma.issuer.update({ where: { id }, data: { isActive } });
  revalidatePath('/issuers');
}
