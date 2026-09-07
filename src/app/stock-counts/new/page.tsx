import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Alert, EmptyState, PageHeader, Panel } from '@/components/ui';
import { StockCountForm } from './form';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewStockCountPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const preselect = (Array.isArray(sp.location) ? sp.location[0] : sp.location) ?? undefined;

  const locations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });

  return (
    <>
      <PageHeader
        title="New stock count"
        description="Record what a location physically holds, then compare it against what the system believes."
        action={<Link href="/stock-counts" className="btn-secondary">Back to counts</Link>}
      />

      {locations.length === 0 ? (
        <Panel>
          <EmptyState
            title="Add a location first"
            hint="A count belongs to a specific vessel, office or warehouse."
            action={<Link href="/locations" className="btn-primary">Go to locations</Link>}
          />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-3">
          <Panel title="Count details" className="xl:col-span-2">
            <StockCountForm locations={locations} defaultLocationId={preselect} />
          </Panel>

          <div className="grid gap-4">
            <Panel title="How the comparison works">
              <div className="space-y-3 p-4 text-sm text-slate-600">
                <p>
                  The system compares your list against every card it believes is <strong>in stock</strong> or{' '}
                  <strong>returned</strong> at that location, and sorts the result into three buckets:
                </p>
                <ul className="space-y-2">
                  <li>
                    <span className="font-semibold text-emerald-700">Matched</span> — expected and found. These get
                    stamped as physically verified on the count date.
                  </li>
                  <li>
                    <span className="font-semibold text-red-700">Missing</span> — the system says it is there, nobody
                    saw it. You decide whether to mark these lost.
                  </li>
                  <li>
                    <span className="font-semibold text-amber-700">Unexpected</span> — found there, but the system had
                    it somewhere else, in another state, or had never heard of it.
                  </li>
                </ul>
                <p className="text-slate-500">
                  Cards already <em>issued</em> to crew are not expected in the safe, so they are not counted as missing.
                  If one does turn up, it lands in the unexpected bucket with its real status attached.
                </p>
              </div>
            </Panel>

            <Alert tone="info" title="Nothing changes yet">
              Recording a count only produces the variance report. The corrections are applied in a separate,
              deliberate step once you have reviewed them.
            </Alert>
          </div>
        </div>
      )}
    </>
  );
}
