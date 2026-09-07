'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { readWorkbookSheet } from '@/lib/excel';
import { suggestMapping } from '@/lib/mapping';
import { buildStockCountLines, reconcileStockCount } from '@/lib/reconcile';

export type ActionState = { error?: string; success?: string };

const createSchema = z.object({
  locationId: z.string().trim().min(1, 'Choose the location that was counted.'),
  countedBy: z.string().trim().min(1, 'Record who did the count.').max(120),
  countDate: z.string().trim().min(1, 'The count date is required.'),
  reference: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/** Split a pasted block on any sane delimiter — commas, tabs, spaces, newlines. */
function splitSerials(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function serialsFromFile(formData: FormData): Promise<{ serials: string[] } | { error: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { serials: [] };
  if (file.size > 20 * 1024 * 1024) return { error: 'That file is over the 20 MB limit.' };
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    return { error: 'Upload an .xlsx or .xlsm file, or paste the serials instead.' };
  }

  try {
    const sheet = await readWorkbookSheet(Buffer.from(await file.arrayBuffer()));
    const requested = String(formData.get('serialHeader') ?? '').trim().toLowerCase();

    let columnIndex = -1;
    if (requested) {
      columnIndex = sheet.headers.findIndex((h) => h.trim().toLowerCase() === requested);
      if (columnIndex < 0) {
        return { error: `No column called "${requested}" in that sheet. Columns are: ${sheet.headers.join(', ')}` };
      }
    } else {
      const suggested = suggestMapping(sheet.headers).serial;
      columnIndex = suggested ?? 0;
    }

    return { serials: sheet.rows.map((r) => (r[columnIndex] ?? '').trim()).filter(Boolean) };
  } catch (err) {
    return { error: `Could not read that file: ${(err as Error).message}` };
  }
}

export async function createStockCount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    locationId: formData.get('locationId'),
    countedBy: formData.get('countedBy'),
    countDate: formData.get('countDate'),
    reference: formData.get('reference') || undefined,
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const countDate = new Date(parsed.data.countDate);
  if (Number.isNaN(countDate.getTime())) return { error: 'The count date is not a valid date.' };

  const fromFile = await serialsFromFile(formData);
  if ('error' in fromFile) return { error: fromFile.error };

  const pasted = splitSerials(String(formData.get('serials') ?? ''));
  const serials = [...pasted, ...fromFile.serials];

  if (serials.length === 0) {
    return { error: 'No serials were provided. Paste them, or upload a sheet containing them.' };
  }

  const location = await prisma.location.findUnique({ where: { id: parsed.data.locationId } });
  if (!location) return { error: 'That location no longer exists.' };

  const reference =
    parsed.data.reference ||
    `SC-${location.code}-${countDate.toISOString().slice(0, 10).replace(/-/g, '')}`;

  const clash = await prisma.stockCount.findUnique({ where: { reference } });
  if (clash) {
    return { error: `Reference "${reference}" is already used. Give this count a different reference.` };
  }

  const count = await prisma.stockCount.create({
    data: {
      reference,
      locationId: parsed.data.locationId,
      countDate,
      countedBy: parsed.data.countedBy,
      notes: parsed.data.notes ?? null,
    },
  });

  await buildStockCountLines(count.id, serials);

  revalidatePath('/stock-counts');
  revalidatePath('/');
  redirect(`/stock-counts/${count.id}`);
}

const reconcileSchema = z.object({
  actor: z.string().trim().min(1, 'Record who approved this reconciliation.').max(120),
  missingAction: z.enum(['LOST', 'LEAVE']),
  unexpectedAction: z.enum(['MOVE', 'LEAVE']),
  createUnknown: z.boolean(),
  unknownCardTypeId: z.string().trim().optional(),
});

export async function reconcile(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = reconcileSchema.safeParse({
    actor: formData.get('actor'),
    missingAction: formData.get('missingAction'),
    unexpectedAction: formData.get('unexpectedAction'),
    createUnknown: formData.get('createUnknown') === 'on',
    unknownCardTypeId: formData.get('unknownCardTypeId') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (parsed.data.createUnknown && !parsed.data.unknownCardTypeId) {
    return { error: 'Choose the card type to use for serials the system has never seen.' };
  }

  try {
    const result = await reconcileStockCount(id, {
      actor: parsed.data.actor,
      missingAction: parsed.data.missingAction,
      unexpectedAction: parsed.data.unexpectedAction,
      createUnknown: parsed.data.createUnknown,
      unknownCardTypeId: parsed.data.unknownCardTypeId ?? null,
    });

    revalidatePath(`/stock-counts/${id}`);
    revalidatePath('/stock-counts');
    revalidatePath('/cards');
    revalidatePath('/');

    return {
      success: `Reconciled: ${result.verified} confirmed, ${result.markedLost} marked lost, ${result.moved} relocated, ${result.created} created.`,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function deleteStockCount(id: string): Promise<void> {
  const count = await prisma.stockCount.findUnique({ where: { id } });
  // A reconciled count is part of the audit trail; only unapplied ones can go.
  if (!count || count.status === 'RECONCILED') return;
  await prisma.stockCount.delete({ where: { id } });
  revalidatePath('/stock-counts');
  revalidatePath('/');
  redirect('/stock-counts');
}
