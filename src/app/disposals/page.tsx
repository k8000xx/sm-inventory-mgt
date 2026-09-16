import Link from 'next/link';
import { prisma } from '@/lib/db';
import { DISPOSAL_METHOD_LABELS, DISPOSAL_REASON_LABELS, type DisposalMethod, type DisposalReason } from '@/lib/constants';
import { formatDate, formatNumber } from '@/lib/format';
import { Alert, EmptyState, PageHeader, Panel } from '@/components/ui';
import { DisposalForm } from './form';

export const dynamic = 'force-dynamic';

export default async function DisposalsPage() {
  const [disposals, locations] = await Promise.all([
    prisma.disposal.findMany({
      include: { location: { select: { name: true } }, _count: { select: { lines: true } } },
      orderBy: { disposedAt: 'desc' },
      take: 50,
    }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Disposals"
        description="Cards taken permanently out of circulation, with the record an auditor will ask for: who, when, how, and against which certificate."
      />

      {locations.length === 0 ? (
        <Panel>
          <EmptyState
            title="Add a location first"
            hint="A disposal is recorded against the place it happened."
            action={<Link href="/locations" className="btn-primary">Go to locations</Link>}
          />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-3">
          <div className="grid items-start gap-4 xl:col-span-2">
            <Panel title="Record a disposal">
              <DisposalForm locations={locations} />
            </Panel>

            {disposals.length > 0 && (
              <Panel title="Previous disposals">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th">Reference</th>
                        <th className="th">Location</th>
                        <th className="th">Reason</th>
                        <th className="th">Method</th>
                        <th className="th">Date</th>
                        <th className="th">By</th>
                        <th className="th text-right">Cards</th>
                      </tr>
                    </thead>
                    <tbody>
                      {disposals.map((d) => (
                        <tr key={d.id} className="row-hover">
                          <td className="td">
                            <Link href={`/disposals/${d.id}`} className="font-medium text-slate-900 hover:underline">
                              {d.reference}
                            </Link>
                          </td>
                          <td className="td text-slate-500">{d.location.name}</td>
                          <td className="td text-slate-500">{DISPOSAL_REASON_LABELS[d.reason as DisposalReason] ?? d.reason}</td>
                          <td className="td text-slate-500">{DISPOSAL_METHOD_LABELS[d.method as DisposalMethod] ?? d.method}</td>
                          <td className="td text-slate-500">{formatDate(d.disposedAt)}</td>
                          <td className="td text-slate-500">{d.disposedBy}</td>
                          <td className="td text-right tabular-nums">{formatNumber(d._count.lines)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>

          <Alert tone="warn" title="Disposal is permanent">
            A disposed card never returns to stock. Every disposal writes a movement against each card, so the trail
            survives even though the card is gone.
          </Alert>
        </div>
      )}
    </>
  );
}
