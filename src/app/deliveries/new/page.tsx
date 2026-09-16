import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Alert, EmptyState, PageHeader, Panel } from '@/components/ui';
import { DeliveryForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewDeliveryPage() {
  const [locations, cardTypes] = await Promise.all([
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.cardType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="New delivery"
        description="Send cards from a warehouse or office out to a vessel. Dispatching marks them in transit; they only join the vessel's stock when someone onboard confirms they arrived."
        action={<Link href="/deliveries" className="btn-secondary">Back to deliveries</Link>}
      />

      {locations.length < 2 ? (
        <Panel>
          <EmptyState
            title="Add at least two locations"
            hint="A delivery moves cards between a source and a destination."
            action={<Link href="/locations" className="btn-primary">Go to locations</Link>}
          />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-3">
          <Panel title="Delivery details" className="xl:col-span-2">
            <DeliveryForm locations={locations} cardTypes={cardTypes} />
          </Panel>

          <div className="grid items-start gap-4">
            <Panel title="Why two steps">
              <div className="space-y-3 p-4 text-sm text-slate-600">
                <p>
                  Creating a delivery builds the manifest but changes nothing. <strong>Dispatching</strong> marks every
                  card on it as in transit, so it stops counting as available stock at the source without yet appearing
                  on the vessel.
                </p>
                <p>
                  When the vessel confirms, you tick off what actually arrived. Anything not ticked stays in transit and
                  shows as short-delivered — which is the whole point when you cannot see the box yourself.
                </p>
                <p className="text-slate-500">
                  Confirmed cards are also stamped as physically verified: somebody had them in their hands.
                </p>
              </div>
            </Panel>
            <Alert tone="info">
              Only cards on hand at the source can be put on a manifest, so the same card cannot be shipped twice.
            </Alert>
          </div>
        </div>
      )}
    </>
  );
}
