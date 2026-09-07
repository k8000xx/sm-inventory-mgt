import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatDate, formatNumber } from '@/lib/format';
import { EmptyState, PageHeader, Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-200',
  SUBMITTED: 'bg-amber-50 text-amber-700 ring-amber-200',
  RECONCILED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export default async function StockCountsPage() {
  const counts = await prisma.stockCount.findMany({
    orderBy: [{ countDate: 'desc' }, { createdAt: 'desc' }],
    include: { location: true, lines: { select: { result: true } } },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Stock counts"
        description="A count is the only thing that turns a believed position into a confirmed one. Record what was physically found, review the variances, then apply the corrections."
        action={<Link href="/stock-counts/new" className="btn-primary">New stock count</Link>}
      />

      <Panel>
        {counts.length === 0 ? (
          <EmptyState
            title="No stock counts yet"
            hint="Ask a vessel or office to list what they physically hold, then record it here to see where the book position has drifted."
            action={<Link href="/stock-counts/new" className="btn-primary">Record a count</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Location</th>
                  <th className="th">Count date</th>
                  <th className="th">Counted by</th>
                  <th className="th text-right">Matched</th>
                  <th className="th text-right">Missing</th>
                  <th className="th text-right">Unexpected</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => {
                  const tally = c.lines.reduce(
                    (acc, l) => {
                      if (l.result === 'MATCH') acc.match += 1;
                      else if (l.result === 'MISSING') acc.missing += 1;
                      else acc.unexpected += 1;
                      return acc;
                    },
                    { match: 0, missing: 0, unexpected: 0 },
                  );

                  return (
                    <tr key={c.id} className="row-hover">
                      <td className="td">
                        <Link href={`/stock-counts/${c.id}`} className="font-medium text-slate-900 hover:underline">
                          {c.reference}
                        </Link>
                      </td>
                      <td className="td">
                        <Link href={`/locations/${c.locationId}`} className="text-slate-700 hover:underline">
                          {c.location.name}
                        </Link>
                      </td>
                      <td className="td text-slate-500">{formatDate(c.countDate)}</td>
                      <td className="td text-slate-500">{c.countedBy}</td>
                      <td className="td text-right tabular-nums text-emerald-700">{formatNumber(tally.match)}</td>
                      <td className={`td text-right tabular-nums ${tally.missing > 0 ? 'font-semibold text-red-700' : 'text-slate-400'}`}>
                        {formatNumber(tally.missing)}
                      </td>
                      <td className={`td text-right tabular-nums ${tally.unexpected > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>
                        {formatNumber(tally.unexpected)}
                      </td>
                      <td className="td">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONES[c.status] ?? ''}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
