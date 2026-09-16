import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { EXCEPTION_STATUSES, ON_HAND_STATUSES, OPEN_ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/constants';
import { formatDate, formatNumber } from '@/lib/format';
import { EmptyState, LocationBadge, PageHeader, Panel, StatTile, StatusBadge } from '@/components/ui';
import { ClientForm } from '../form';
import { updateClient } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const [byStatus, locations, orders, cardholders, openLines] = await Promise.all([
    prisma.card.groupBy({ by: ['status'], where: { clientId: id }, _count: { _all: true } }),
    prisma.location.findMany({ where: { clientId: id }, orderBy: { name: 'asc' } }),
    prisma.cardOrder.findMany({
      where: { clientId: id },
      include: { issuer: true, lines: { select: { quantity: true, receivedQuantity: true } } },
      orderBy: { orderedAt: 'desc' },
      take: 10,
    }),
    prisma.cardholder.findMany({
      where: { clientId: id },
      include: { _count: { select: { cards: true } }, location: { select: { name: true } } },
      orderBy: { lastName: 'asc' },
      take: 15,
    }),
    prisma.cardOrderLine.findMany({
      where: { order: { clientId: id, status: { in: [...OPEN_ORDER_STATUSES] } } },
      select: { quantity: true, receivedQuantity: true },
    }),
  ]);

  const counted = new Map(byStatus.map((g) => [g.status, g._count._all]));
  const sum = (statuses: readonly string[]) => statuses.reduce((a, s) => a + (counted.get(s) ?? 0), 0);
  const total = byStatus.reduce((a, g) => a + g._count._all, 0);
  const onOrder = openLines.reduce((a, l) => a + Math.max(0, l.quantity - l.receivedQuantity), 0);

  return (
    <>
      <PageHeader
        title={client.name}
        description={`${client.code}${client.country ? ` · ${client.country}` : ''}`}
        action={
          <div className="flex gap-2">
            <Link href={`/cards?client=${client.id}`} className="btn-secondary">View cards</Link>
            <Link href={`/orders/new?client=${client.id}`} className="btn-primary">Order cards</Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile label="On order" value={formatNumber(onOrder)} tone={onOrder > 0 ? 'warn' : 'neutral'} hint="Not yet received" />
        <StatTile label="On hand" value={formatNumber(sum(ON_HAND_STATUSES))} tone="good" />
        <StatTile label="In transit" value={formatNumber(counted.get('IN_TRANSIT') ?? 0)} />
        <StatTile label="Issued" value={formatNumber(counted.get('ISSUED') ?? 0)} />
        <StatTile label="Registered" value={formatNumber(counted.get('REGISTERED') ?? 0)} hint="Live with a cardholder" />
        <StatTile
          label="Exceptions"
          value={formatNumber(sum(EXCEPTION_STATUSES))}
          tone={sum(EXCEPTION_STATUSES) > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-3">
        <div className="grid items-start gap-4 xl:col-span-2">
          <Panel title="Locations" action={<Link href="/locations" className="text-sm font-medium text-slate-600 hover:text-slate-900">Manage</Link>}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Location</th>
                    <th className="th">Type</th>
                    <th className="th">Region</th>
                    <th className="th">IMO</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l) => (
                    <tr key={l.id} className="row-hover">
                      <td className="td">
                        <Link href={`/locations/${l.id}`} className="font-medium text-slate-900 hover:underline">{l.name}</Link>
                        <span className="ml-1.5 text-xs text-slate-400">{l.code}</span>
                      </td>
                      <td className="td"><LocationBadge type={l.type} /></td>
                      <td className="td text-slate-500">{l.region ?? '—'}</td>
                      <td className="td text-slate-500">{l.vesselImo ?? '—'}</td>
                    </tr>
                  ))}
                  {locations.length === 0 && (
                    <tr><td colSpan={4}><EmptyState title="No locations for this client" hint="Add their vessels and offices under Locations." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Orders" action={<Link href={`/orders?client=${client.id}`} className="text-sm font-medium text-slate-600 hover:text-slate-900">All</Link>}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Reference</th>
                    <th className="th">Issuer</th>
                    <th className="th">Ordered</th>
                    <th className="th text-right">Qty</th>
                    <th className="th text-right">Received</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const qty = o.lines.reduce((a, l) => a + l.quantity, 0);
                    const got = o.lines.reduce((a, l) => a + l.receivedQuantity, 0);
                    return (
                      <tr key={o.id} className="row-hover">
                        <td className="td">
                          <Link href={`/orders/${o.id}`} className="font-medium text-slate-900 hover:underline">{o.reference}</Link>
                        </td>
                        <td className="td text-slate-500">{o.issuer.name}</td>
                        <td className="td text-slate-500">{formatDate(o.orderedAt)}</td>
                        <td className="td text-right tabular-nums">{formatNumber(qty)}</td>
                        <td className="td text-right tabular-nums">{formatNumber(got)}</td>
                        <td className="td text-xs font-medium text-slate-600">
                          {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                        </td>
                      </tr>
                    );
                  })}
                  {orders.length === 0 && (
                    <tr><td colSpan={6}><EmptyState title="No orders yet" hint="Ordering cards is how stock enters inventory for this client." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Cardholders" action={<Link href={`/cardholders?client=${client.id}`} className="text-sm font-medium text-slate-600 hover:text-slate-900">All</Link>}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Name</th>
                    <th className="th">Reference</th>
                    <th className="th">Rank</th>
                    <th className="th">Vessel</th>
                    <th className="th text-right">Cards</th>
                  </tr>
                </thead>
                <tbody>
                  {cardholders.map((h) => (
                    <tr key={h.id} className="row-hover">
                      <td className="td">
                        <Link href={`/cardholders/${h.id}`} className="font-medium text-slate-900 hover:underline">
                          {h.lastName}, {h.firstName}
                        </Link>
                      </td>
                      <td className="td font-mono text-xs text-slate-500">{h.ref}</td>
                      <td className="td text-slate-500">{h.rank ?? '—'}</td>
                      <td className="td text-slate-500">{h.location?.name ?? '—'}</td>
                      <td className="td text-right tabular-nums">{formatNumber(h._count.cards)}</td>
                    </tr>
                  ))}
                  {cardholders.length === 0 && (
                    <tr><td colSpan={5}><EmptyState title="No cardholders on file" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="grid items-start gap-4">
          <Panel title="Card position">
            <dl className="divide-y divide-slate-100">
              {byStatus
                .slice()
                .sort((a, b) => b._count._all - a._count._all)
                .map((g) => (
                  <div key={g.status} className="flex items-center justify-between gap-3 px-4 py-2">
                    <dt><StatusBadge status={g.status} /></dt>
                    <dd className="text-sm font-medium tabular-nums text-slate-800">{formatNumber(g._count._all)}</dd>
                  </div>
                ))}
              <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</dt>
                <dd className="text-sm font-semibold tabular-nums text-slate-900">{formatNumber(total)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Edit client">
            <ClientForm action={updateClient.bind(null, client.id)} values={client} submitLabel="Save changes" />
          </Panel>
        </div>
      </div>
    </>
  );
}
