import Link from 'next/link';
import { prisma } from '@/lib/db';
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from '@/lib/constants';
import { daysSince, formatDate, formatNumber } from '@/lib/format';
import { EmptyState, PageHeader, Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

const TONES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-200',
  DISPATCHED: 'bg-amber-50 text-amber-700 ring-amber-200',
  RECEIVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default async function DeliveriesPage() {
  const deliveries = await prisma.delivery.findMany({
    include: {
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
      client: { select: { name: true } },
      lines: { select: { received: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 150,
  });

  return (
    <>
      <PageHeader
        title="Deliveries"
        description="Cards on their way to vessels and offices. A delivery stays open until someone at the destination confirms what arrived."
        action={<Link href="/deliveries/new" className="btn-primary">New delivery</Link>}
      />

      <Panel>
        {deliveries.length === 0 ? (
          <EmptyState
            title="No deliveries yet"
            hint="Send stock from your warehouse out to a vessel to get started."
            action={<Link href="/deliveries/new" className="btn-primary">New delivery</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">From</th>
                  <th className="th">To</th>
                  <th className="th">Client</th>
                  <th className="th text-right">Cards</th>
                  <th className="th text-right">Received</th>
                  <th className="th">Dispatched</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => {
                  const received = d.lines.filter((l) => l.received).length;
                  const inFlight = d.status === 'DISPATCHED' ? daysSince(d.dispatchedAt) : null;
                  return (
                    <tr key={d.id} className="row-hover">
                      <td className="td">
                        <Link href={`/deliveries/${d.id}`} className="font-medium text-slate-900 hover:underline">{d.reference}</Link>
                      </td>
                      <td className="td text-slate-500">{d.fromLocation.name}</td>
                      <td className="td text-slate-700">{d.toLocation.name}</td>
                      <td className="td text-slate-500">{d.client?.name ?? '—'}</td>
                      <td className="td text-right tabular-nums">{formatNumber(d.lines.length)}</td>
                      <td className="td text-right tabular-nums text-emerald-700">{formatNumber(received)}</td>
                      <td className="td text-slate-500">
                        {formatDate(d.dispatchedAt)}
                        {inFlight !== null && inFlight > 21 && (
                          <span className="ml-1.5 text-xs font-medium text-amber-700">{inFlight}d in transit</span>
                        )}
                      </td>
                      <td className="td">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[d.status] ?? ''}`}>
                          {DELIVERY_STATUS_LABELS[d.status as DeliveryStatus] ?? d.status}
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
