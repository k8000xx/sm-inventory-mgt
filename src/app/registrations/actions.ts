'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { readWorkbookSheet } from '@/lib/excel';
import { suggestMapping } from '@/lib/mapping';
import { parseRegistrationInput, registerCards, type RegistrationInput } from '@/lib/registration';

export type ActionState = { error?: string; success?: string };

const schema = z.object({
  recordedBy: z.string().trim().min(1, 'Record who is entering this').max(120),
  registeredOn: z.string().trim().min(1, 'A registration date is required'),
  reference: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/** Pull serials, and any cardholder references, out of an uploaded sheet. */
async function entriesFromFile(formData: FormData): Promise<{ entries: RegistrationInput[] } | { error: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { entries: [] };
  if (file.size > 20 * 1024 * 1024) return { error: 'That file is over the 20 MB limit.' };
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    return { error: 'Upload an .xlsx or .xlsm file, or paste the serials instead.' };
  }

  try {
    const sheet = await readWorkbookSheet(Buffer.from(await file.arrayBuffer()));
    const requested = String(formData.get('serialHeader') ?? '').trim().toLowerCase();

    let serialCol = -1;
    if (requested) {
      serialCol = sheet.headers.findIndex((h) => h.trim().toLowerCase() === requested);
      if (serialCol < 0) {
        return { error: `No column called "${requested}" in that sheet. Columns are: ${sheet.headers.join(', ')}` };
      }
    } else {
      serialCol = suggestMapping(sheet.headers).serial ?? 0;
    }

    // A cardholder reference column is used when the sheet happens to carry one.
    const holderCol = suggestMapping(sheet.headers).cardholderRef;

    const entries = sheet.rows
      .map((row) => ({
        serial: (row[serialCol] ?? '').trim(),
        cardholderRef: holderCol !== undefined ? (row[holderCol] ?? '').trim() || undefined : undefined,
      }))
      .filter((e) => e.serial);

    return { entries };
  } catch (err) {
    return { error: `Could not read that file: ${(err as Error).message}` };
  }
}

export async function createRegistration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    recordedBy: formData.get('recordedBy'),
    registeredOn: formData.get('registeredOn'),
    reference: formData.get('reference') || undefined,
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const registeredOn = new Date(parsed.data.registeredOn);
  if (Number.isNaN(registeredOn.getTime())) return { error: 'The registration date is not valid.' };

  const fromFile = await entriesFromFile(formData);
  if ('error' in fromFile) return { error: fromFile.error };

  const pasted = parseRegistrationInput(String(formData.get('serials') ?? ''));
  const entries = [...pasted, ...fromFile.entries];

  if (entries.length === 0) {
    return { error: 'No serials were provided. Paste them, or upload a sheet containing them.' };
  }

  let batchId: string;
  try {
    const summary = await registerCards({
      entries,
      recordedBy: parsed.data.recordedBy,
      registeredOn,
      source: fromFile.entries.length > 0 ? 'FILE' : 'PASTE',
      reference: parsed.data.reference,
      notes: parsed.data.notes ?? null,
    });
    batchId = summary.batchId;
  } catch (err) {
    return { error: (err as Error).message };
  }

  revalidatePath('/registrations');
  revalidatePath('/cards');
  revalidatePath('/');
  redirect(`/registrations/${batchId}`);
}
