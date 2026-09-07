import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Alert, EmptyState, PageHeader, Panel } from '@/components/ui';
import { CardForm } from '../form';
import { createCard } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewCardPage() {
  const [locations, cardTypes] = await Promise.all([
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.cardType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Add a card"
        description="For one-off receipts and corrections. Bulk loads belong in the spreadsheet importer."
        action={<Link href="/cards" className="btn-secondary">Back to cards</Link>}
      />

      {cardTypes.length === 0 ? (
        <Panel>
          <EmptyState
            title="Add a card type first"
            hint="Every card belongs to a card type, so create one before adding stock."
            action={<Link href="/card-types" className="btn-primary">Go to card types</Link>}
          />
        </Panel>
      ) : (
        <div className="max-w-3xl">
          <div className="mb-4">
            <Alert tone="info">
              A card added here is recorded as unverified until a stock count or an import confirms it is physically present.
            </Alert>
          </div>
          <Panel title="Card details">
            <CardForm action={createCard} locations={locations} cardTypes={cardTypes} submitLabel="Add card" />
          </Panel>
        </div>
      )}
    </>
  );
}
