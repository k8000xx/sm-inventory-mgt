import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { Alert, PageHeader, Panel, StatTile, StatusBadge } from '@/components/ui';
import { ReconcileForm } from './reconcile-form';
import { deleteStockCount } from '../actions';

export const dynamic = 'force-dynamic';

const RESULT_STYLES: Record<string, { label: string; className: string }> = {
  MATCH: { label: 'Matched', className: 'text-emerald-700' },
  MISSING: { label: 'Missing', className: 'text-red-700' },
  UNEXPECTED: { label: 'Unexpected', className: 'text-amber-700' },
};

export default async function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: {
      location: true,
      lines: { orderBy: [{ result: 'asc' }, { serial: 'asc' }] },
    },
  });
  if (!count) notFound();

  const [cardTypes, locationsById] = await Promise.all([
    prisma.cardType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.location.findMany({ select: { id: true, name: true } }),
  ]);
  const locationName = new Map(locationsById.map((l) => [l.id, l.name]));

  const buckets = {
    MATCH: count.lines.filter((l) => l.result === 'MATCH'),
    MISSING: count.lines.filter((l) => l.result === 'MISSING'),
    UNEXPECTED: count.lines.filter((l) => l.result === 'UNEXPECTED'),
  };
  const unknownSerials = buckets.UNEXPECTED.filter((l) => !l.cardId);
  const expected = buckets.MATCH.length + buckets.MISSING.length;
  const accuracy = expected > 0 ? Math.round((buckets.MATCH.length / expected) * 100) : 100;
  const reconciled = count.status === 'RECONCILED';

  return (
    <>
      <PageHeader
        title={count.reference}
        description={`${count.location.name} · counted ${formatDate(count.countDate)} by ${count.countedBy}`}
        action={
          <div className="flex gap-2">
            <Link href={`/api/export/stock-count/${count.id}`} className="btn-secondary">Export CSV</Link>
            <Link href="/stock-counts" className="btn-secondary">Back to counts</Link>
          </div>
        }
      />

      {reconciled ? (
        <div className="mb-4">
          <Alert tone="good" title="Reconciled">
            Applied {formatDateTime(count.reconciledAt)} by {count.reconciledBy}. The corrections below are recorded
            against each card&rsquo;s movement history.
          </Alert>
        </div>
      ) : (
        <div className="mb-4">
          <Alert tone="warn" title="Variances not yet applied">
            This is a comparison only. Nothing has changed in inventory until you apply the corrections below.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Counted" value={formatNumber(buckets.MATCH.length + buckets.UNEXPECTED.length)} hint="Serials submitted" />
        <StatTile label="Expected" value={formatNumber(expected)} hint="Book position at this location" />
        <StatTile label="Matched" value={formatNumber(buckets.MATCH.length)} tone="good" />
        <StatTile label="Missing" value={formatNumber(buckets.MISSING.length)} tone={buckets.MISSING.length > 0 ? 'danger' : 'neutral'} />
        <StatTile
          label="Count accuracy"
          value={`${accuracy}%`}
          tone={accuracy === 100 ? 'good' : accuracy >= 95 ? 'warn' : 'danger'}
          hint="Matched ÷ expected"
        />
      </div>

      {count.notes && (
        <div className="mt-4">
          <Panel title="Notes">
            <p className="px-4 py-3 text-sm text-slate-600">{count.notes}</p>
          </Panel>
        </div>
      )}

      {!reconciled && (
        <div className="mt-4">
          <Panel title="Apply corrections">
            <ReconcileForm
              countId={count.id}
              cardTypes={cardTypes}
              missingCount={buckets.MISSING.length}
              unexpectedCount={buckets.UNEXPECTED.length}
              unknownCount={unknownSerials.length}
            />
          </Panel>
        </div>
      )}

      <div className="mt-4 grid gap-4">
        {(['MISSING', 'UNEXPECTED', 'MATCH'] as const).map((bucket) => {
          const lines = buckets[bucket];
          if (lines.length === 0) return null;
          const style = RESULT_STYLES[bucket];

          return (
            <Panel key={bucket} title={`${style.label} — ${formatNumber(lines.length)}`}>
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="th">Serial</th>
                      <th className="th">System status</th>
                      <th className="th">System location</th>
                      {reconciled && <th className="th">Action taken</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="row-hover">
                        <td className="td">
                          {l.cardId ? (
                            <Link href={`/cards/${l.cardId}`} className="font-mono text-xs text-slate-900 hover:underline">
                              {l.serial}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-slate-700">
                              {l.serial}
                              <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                                not in system
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="td">{l.systemStatus ? <StatusBadge status={l.systemStatus} /> : '—'}</td>
                        <td className="td text-slate-500">
                          {l.systemLocationId ? locationName.get(l.systemLocationId) ?? '—' : '—'}
                        </td>
                        {reconciled && <td className="td text-slate-600">{l.resolution ?? '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })}
      </div>

      {!reconciled && (
        <div className="mt-6">
          <form
            action={async () => {
              'use server';
              await deleteStockCount(count.id);
            }}
          >
            <button type="submit" className="btn-danger">
              Discard this count
            </button>
          </form>
          <p className="mt-1 text-xs text-slate-500">
            Only counts that have not been applied can be discarded.
          </p>
        </div>
      )}
    </>
  );
}
