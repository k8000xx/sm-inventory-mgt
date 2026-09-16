import { prisma } from '@/lib/db';
import { CARD_STATUS_LABELS, REGISTRABLE_STATUSES, type CardStatus } from '@/lib/constants';
import { applyCardChange } from '@/lib/inventory';

export type RegistrationInput = {
  /** Serial, with an optional cardholder reference alongside it. */
  serial: string;
  cardholderRef?: string;
};

export type RegistrationSummary = {
  batchId: string;
  reference: string;
  total: number;
  registered: number;
  alreadyRegistered: number;
  notFound: number;
  rejected: number;
  linkedHolders: number;
};

const key = (s: string) => s.trim().toLowerCase();

/**
 * Parse pasted registration input. One card per line; an optional cardholder
 * reference may follow the serial, separated by a comma, tab or spaces — which
 * is what a copy-paste out of an issuer portal or a crewing sheet looks like.
 */
export function parseRegistrationInput(raw: string): RegistrationInput[] {
  const out: RegistrationInput[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[\s,;\t]+/).filter(Boolean);
    if (parts.length === 0) continue;
    out.push({ serial: parts[0], cardholderRef: parts[1] });
  }
  return out;
}

/**
 * Record a batch of cards as registered.
 *
 * Registration is the single "this card is live" milestone, and REGISTERED is
 * not an on-hand status — so booking a registration is what deducts the card
 * from available inventory. Nothing else needs to be done by hand.
 *
 * Registration data usually arrives from the issuer after the fact, so a card
 * still sitting as IN_STOCK or IN_TRANSIT is registered anyway rather than
 * rejected: the issuer knows better than the book does. Cards that are already
 * gone (disposed, lost, expired) are rejected and reported.
 */
export async function registerCards(input: {
  entries: RegistrationInput[];
  recordedBy: string;
  registeredOn?: Date;
  source?: string;
  reference?: string;
  notes?: string | null;
}): Promise<RegistrationSummary> {
  const registeredOn = input.registeredOn ?? new Date();
  const recordedBy = input.recordedBy;

  // The same serial twice in one paste is one card, not two.
  const entries = [...new Map(input.entries.map((e) => [key(e.serial), e])).values()].filter(
    (e) => e.serial.trim().length > 0,
  );
  if (entries.length === 0) throw new Error('No serials were provided.');

  const reference =
    input.reference?.trim() ||
    `REG-${registeredOn.toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-5)}`;

  const clash = await prisma.registrationBatch.findUnique({ where: { reference } });
  if (clash) throw new Error(`Reference "${reference}" is already used.`);

  return prisma.$transaction(
    async (tx) => {
      const cards = await tx.card.findMany({
        where: { serial: { in: entries.map((e) => e.serial.trim()) } },
      });
      const bySerial = new Map(cards.map((c) => [key(c.serial), c]));

      // Resolve any cardholder references against the clients owning the cards.
      const refs = entries.map((e) => e.cardholderRef).filter((r): r is string => Boolean(r));
      const holders = refs.length
        ? await tx.cardholder.findMany({ where: { ref: { in: refs } } })
        : [];

      const batch = await tx.registrationBatch.create({
        data: {
          reference,
          source: input.source ?? 'PASTE',
          registeredOn,
          recordedBy,
          notes: input.notes ?? null,
        },
      });

      const summary: RegistrationSummary = {
        batchId: batch.id,
        reference,
        total: entries.length,
        registered: 0,
        alreadyRegistered: 0,
        notFound: 0,
        rejected: 0,
        linkedHolders: 0,
      };

      for (const entry of entries) {
        const serial = entry.serial.trim();
        const card = bySerial.get(key(serial));

        if (!card) {
          await tx.registrationLine.create({
            data: {
              batchId: batch.id,
              serial,
              result: 'NOT_FOUND',
              cardholderRef: entry.cardholderRef ?? null,
              note: 'No card with this serial is on file.',
            },
          });
          summary.notFound += 1;
          continue;
        }

        if (card.status === 'REGISTERED') {
          await tx.registrationLine.create({
            data: {
              batchId: batch.id,
              serial,
              cardId: card.id,
              result: 'ALREADY_REGISTERED',
              cardholderRef: entry.cardholderRef ?? null,
              note: `Registered on ${card.registeredAt?.toISOString().slice(0, 10) ?? 'an earlier date'}.`,
            },
          });
          summary.alreadyRegistered += 1;
          continue;
        }

        if (!REGISTRABLE_STATUSES.includes(card.status as CardStatus)) {
          await tx.registrationLine.create({
            data: {
              batchId: batch.id,
              serial,
              cardId: card.id,
              result: 'REJECTED',
              cardholderRef: entry.cardholderRef ?? null,
              note: `Card is ${CARD_STATUS_LABELS[card.status as CardStatus] ?? card.status} and cannot be registered.`,
            },
          });
          summary.rejected += 1;
          continue;
        }

        // Link the cardholder when the reference resolves within the card's client.
        let cardholderId: string | undefined;
        if (entry.cardholderRef) {
          const match = holders.find(
            (h) => key(h.ref) === key(entry.cardholderRef!) && (!card.clientId || h.clientId === card.clientId),
          );
          if (match) {
            cardholderId = match.id;
            summary.linkedHolders += 1;
          }
        }

        await applyCardChange(
          tx,
          card,
          {
            status: 'REGISTERED',
            registeredAt: registeredOn,
            cardholderId,
            issuedAt: card.issuedAt ?? registeredOn,
          },
          {
            type: 'REGISTER',
            actor: recordedBy,
            reference,
            occurredAt: registeredOn,
            registrationBatchId: batch.id,
            notes: 'Registered — removed from available stock',
          },
        );

        await tx.registrationLine.create({
          data: {
            batchId: batch.id,
            serial,
            cardId: card.id,
            result: 'REGISTERED',
            cardholderRef: entry.cardholderRef ?? null,
            note: cardholderId
              ? 'Registered and linked to cardholder.'
              : entry.cardholderRef
                ? 'Registered. Cardholder reference did not match any record.'
                : null,
          },
        });
        summary.registered += 1;
      }

      await tx.registrationBatch.update({
        where: { id: batch.id },
        data: {
          linesTotal: summary.total,
          linesRegistered: summary.registered,
          linesSkipped: summary.alreadyRegistered + summary.notFound,
          linesRejected: summary.rejected,
        },
      });

      return summary;
    },
    { maxWait: 15_000, timeout: 300_000 },
  );
}
