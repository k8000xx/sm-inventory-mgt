'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { DISPOSABLE_STATUSES, DISPOSAL_METHODS, DISPOSAL_REASONS } from '@/lib/constants';
import { disposeCards } from '@/lib/disposal';

export type ActionState = { error?: string; success?: string };

const schema = z.object({
  locationId: z.string().trim().min(1, 'Choose where the cards were disposed of'),
  reason: z.enum(DISPOSAL_REASONS),
  method: z.enum(DISPOSAL_METHODS),
  disposedBy: z.string().trim().min(1, 'Record who carried out the disposal').max(120),
  witnessedBy: z.string().trim().max(120).optional(),
  certificateRef: z.string().trim().max(120).optional(),
  disposedAt: z.string().trim().min(1, 'A disposal date is required'),
  reference: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function createDisposal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    locationId: formData.get('locationId'),
    reason: formData.get('reason'),
    method: formData.get('method'),
    disposedBy: formData.get('disposedBy'),
    witnessedBy: formData.get('witnessedBy') || undefined,
    certificateRef: formData.get('certificateRef') || undefined,
    disposedAt: formData.get('disposedAt'),
    reference: formData.get('reference') || undefined,
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const disposedAt = new Date(parsed.data.disposedAt);
  if (Number.isNaN(disposedAt.getTime())) return { error: 'The disposal date is not valid.' };

  const serials = String(formData.get('serials') ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const explicitIds = formData.getAll('cardIds').map(String).filter(Boolean);

  let cardIds = explicitIds;
  if (cardIds.length === 0) {
    if (serials.length === 0) {
      return { error: 'List the serials being disposed of.' };
    }
    const cards = await prisma.card.findMany({
      where: { serial: { in: serials }, status: { in: DISPOSABLE_STATUSES } },
      select: { id: true, serial: true },
    });
    if (cards.length === 0) {
      return { error: 'None of those serials are on file in a state that can be disposed of.' };
    }
    cardIds = cards.map((c) => c.id);
  }

  let disposalId: string;
  try {
    const result = await disposeCards({
      cardIds,
      locationId: parsed.data.locationId,
      reason: parsed.data.reason,
      method: parsed.data.method,
      disposedBy: parsed.data.disposedBy,
      witnessedBy: parsed.data.witnessedBy ?? null,
      certificateRef: parsed.data.certificateRef ?? null,
      disposedAt,
      reference: parsed.data.reference,
      notes: parsed.data.notes ?? null,
    });
    disposalId = result.disposalId;
  } catch (err) {
    return { error: (err as Error).message };
  }

  revalidatePath('/disposals');
  revalidatePath('/cards');
  revalidatePath('/');
  redirect(`/disposals/${disposalId}`);
}
