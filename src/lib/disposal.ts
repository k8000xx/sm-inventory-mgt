import { prisma } from '@/lib/db';
import { DISPOSABLE_STATUSES, type CardStatus } from '@/lib/constants';
import { applyCardChange } from '@/lib/inventory';

export type DisposalSummary = {
  disposalId: string;
  reference: string;
  disposed: number;
  skipped: number;
};

/**
 * Take cards permanently out of circulation, with the paper trail an auditor
 * asks for: who disposed of them, who witnessed it, how, and against which
 * certificate. Disposal is terminal — a disposed card is never re-used, and the
 * correction for a mistake is a new movement, not an edit.
 */
export async function disposeCards(input: {
  cardIds: string[];
  locationId: string;
  reason: string;
  method: string;
  disposedBy: string;
  witnessedBy?: string | null;
  certificateRef?: string | null;
  disposedAt?: Date;
  reference?: string;
  notes?: string | null;
}): Promise<DisposalSummary> {
  if (input.cardIds.length === 0) throw new Error('Select at least one card to dispose of.');

  const disposedAt = input.disposedAt ?? new Date();
  const location = await prisma.location.findUnique({ where: { id: input.locationId } });
  if (!location) throw new Error('That location no longer exists.');

  const reference =
    input.reference?.trim() ||
    `DSP-${location.code}-${disposedAt.toISOString().slice(0, 10).replace(/-/g, '')}`;

  const clash = await prisma.disposal.findUnique({ where: { reference } });
  if (clash) throw new Error(`Reference "${reference}" is already used. Give this disposal a different reference.`);

  return prisma.$transaction(
    async (tx) => {
      const disposal = await tx.disposal.create({
        data: {
          reference,
          locationId: input.locationId,
          reason: input.reason,
          method: input.method,
          disposedAt,
          disposedBy: input.disposedBy,
          witnessedBy: input.witnessedBy ?? null,
          certificateRef: input.certificateRef ?? null,
          notes: input.notes ?? null,
        },
      });

      const cards = await tx.card.findMany({ where: { id: { in: input.cardIds } } });

      let disposed = 0;
      for (const card of cards) {
        if (!DISPOSABLE_STATUSES.includes(card.status as CardStatus)) continue;

        await applyCardChange(
          tx,
          card,
          {
            status: 'DISPOSED',
            disposedAt,
            disposalReason: input.reason,
          },
          {
            type: 'DISPOSE',
            actor: input.disposedBy,
            reference,
            occurredAt: disposedAt,
            disposalId: disposal.id,
            notes: `Disposed (${input.reason}, ${input.method})`,
          },
        );

        await tx.disposalLine.create({ data: { disposalId: disposal.id, cardId: card.id } });
        disposed += 1;
      }

      if (disposed === 0) {
        throw new Error('None of the selected cards are in a state that can be disposed of.');
      }

      return {
        disposalId: disposal.id,
        reference,
        disposed,
        skipped: input.cardIds.length - disposed,
      };
    },
    { maxWait: 15_000, timeout: 300_000 },
  );
}
