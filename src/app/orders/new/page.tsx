import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Alert, EmptyState, PageHeader, Panel } from '@/components/ui';
import { OrderForm } from './form';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewOrderPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const preselect = (Array.isArray(sp.client) ? sp.client[0] : sp.client) ?? undefined;

  const [clients, issuers, cardTypes, locations] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.issuer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.cardType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, issuerId: true, issuer: { select: { name: true } } },
    }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
  ]);

  const missing: string[] = [];
  if (clients.length === 0) missing.push('a client');
  if (issuers.length === 0) missing.push('an issuer');
  if (cardTypes.length === 0) missing.push('a card type');
  if (locations.length === 0) missing.push('a delivery location');

  return (
    <>
      <PageHeader
        title="New card order"
        description="Ordering cards for a client is how stock enters the system. The serial range on each line becomes real card records when the order is received."
        action={<Link href="/orders" className="btn-secondary">Back to orders</Link>}
      />

      {missing.length > 0 ? (
        <Panel>
          <EmptyState
            title={`Set up ${missing.join(', ')} first`}
            hint="An order needs a client to own the cards, an issuer to produce them, a product, and somewhere to deliver them."
            action={
              <div className="flex justify-center gap-2">
                <Link href="/clients" className="btn-secondary">Clients</Link>
                <Link href="/issuers" className="btn-secondary">Issuers</Link>
                <Link href="/card-types" className="btn-secondary">Card types</Link>
                <Link href="/locations" className="btn-secondary">Locations</Link>
              </div>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="mb-4">
            <Alert tone="info" title="Nothing enters inventory yet">
              Creating the order records what you have asked the issuer for. The cards themselves are generated from
              the serial ranges when you mark the order received — so the pipeline and the actual stock never blur together.
            </Alert>
          </div>
          <OrderForm
            clients={clients}
            issuers={issuers}
            cardTypes={cardTypes.map((t) => ({ id: t.id, name: t.name, code: t.code, issuerId: t.issuerId, issuerName: t.issuer.name }))}
            locations={locations}
            defaultClientId={preselect}
          />
        </>
      )}
    </>
  );
}
