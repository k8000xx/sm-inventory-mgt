import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/constants';
import { formatDate, formatNumber } from '@/lib/format';
import { EmptyState, PageHeader, Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const STATUS_TONES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-200',
  SUBMITTED: 'bg-sky-50 text-sky-700 ring-sky-200',
  IN_PRODUCTION: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  SHIPPED: 'bg-amber-50 text-amber-700 ring-amber-200',
  PARTIALLY_RECEIVED: 'bg-amber-50 text-amber-700 ring-amber-200',
  RECEIVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const clientId = first(sp.client);
  const status = first(sp.status);

  const where: Prisma.CardOrderWhereInput = {};
  if (clientId) where.clientId = clientId;
  if (status) where.status = status;

  const [orders, clients] = await Promise.all([
    prisma.cardOrder.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        issuer: { select: { name: true } },
        deliverToLocation: { select: { name: true } },
        lines: { select: { quantity: true, receivedQuantity: true } },
      },
      orderBy: [{ orderedAt: 'desc' }],
      take: 200,
    }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Card orders"
        description="What you have asked each issuer to produce. Receiving an order injects its serial ranges into inventory."
        action={<Link href="/orders/new" className="btn-primary">New order</Link>}
      />

      <Panel className="mb-4">
        <form className="grid gap-2 p-4 md:grid-cols-4">
          <select name="client" className="input" defaultValue={clientId}>
            <option value="">Any client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select name="status" className="input" defaultValue={status}>
            <option value="">Any status</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary">Filter</button>
        </form>
      </Panel>

      <Panel>
        {orders.length === 0 ? (
          <EmptyState
            title="No orders match"
            hint="Placing an order is how new stock gets into the system."
            action={<Link href="/orders/new" className="btn-primary">New order</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Client</th>
                  <th className="th">Issuer</th>
                  <th className="th">Deliver to</th>
                  <th className="th">Ordered</th>
                  <th className="th">Expected</th>
                  <th className="th text-right">Ordered qty</th>
                  <th className="th text-right">Received</th>
                  <th className="th text-right">Outstanding</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const qty = o.lines.reduce((a, l) => a + l.quantity, 0);
                  const got = o.lines.reduce((a, l) => a + l.receivedQuantity, 0);
                  const outstanding = Math.max(0, qty - got);
                  return (
                    <tr key={o.id} className="row-hover">
                      <td className="td">
                        <Link href={`/orders/${o.id}`} className="font-medium text-slate-900 hover:underline">{o.reference}</Link>
                      </td>
                      <td className="td">
                        <Link href={`/clients/${o.client.id}`} className="text-slate-700 hover:underline">{o.client.name}</Link>
                      </td>
                      <td className="td text-slate-500">{o.issuer.name}</td>
                      <td className="td text-slate-500">{o.deliverToLocation.name}</td>
                      <td className="td text-slate-500">{formatDate(o.orderedAt)}</td>
                      <td className="td text-slate-500">{formatDate(o.expectedAt)}</td>
                      <td className="td text-right tabular-nums">{formatNumber(qty)}</td>
                      <td className="td text-right tabular-nums text-emerald-700">{formatNumber(got)}</td>
                      <td className={`td text-right tabular-nums ${outstanding > 0 ? 'font-medium text-amber-700' : 'text-slate-400'}`}>
                        {formatNumber(outstanding)}
                      </td>
                      <td className="td">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONES[o.status] ?? ''}`}>
                          {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
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
