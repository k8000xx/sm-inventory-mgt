import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  getClientPositions,
  getExpiringSoon,
  getIssuerBreakdown,
  getLocationPositions,
  getOnOrderTotal,
  getOpenDeliveries,
  getOpenOrders,
  getOpenStockCounts,
  getRecentMovements,
  getStatusTotals,
  getStrandedInTransit,
  getUnassignedCount,
} from '@/lib/queries';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  Alert,
  EmptyState,
  LocationBadge,
  MovementBadge,
  Panel,
  PageHeader,
  StatTile,
  StatusBadge,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [
    totals,
    positions,
    unassigned,
    movements,
    expiring,
    openCounts,
    cardCount,
    clientPositions,
    issuerBreakdown,
    onOrder,
    openOrders,
    openDeliveries,
    stranded,
  ] = await Promise.all([
    getStatusTotals(),
    getLocationPositions(),
    getUnassignedCount(),
    getRecentMovements(12),
    getExpiringSoon(90),
    getOpenStockCounts(),
    prisma.card.count(),
    getClientPositions(),
    getIssuerBreakdown(),
    getOnOrderTotal(),
    getOpenOrders(),
    getOpenDeliveries(),
    getStrandedInTransit(),
  ]);

  const onHand = totals.IN_STOCK + totals.RETURNED;
  const inField = totals.ISSUED + totals.REGISTERED;
  const exceptions = totals.LOST + totals.DAMAGED;

  const staleLocations = positions.filter((p) => p.stale);
  const lowStock = positions.filter((p) => p.lowStock);

  // Deliveries that left weeks ago and have never been confirmed are the thing
  // most likely to be quietly wrong when stock is out of reach.
  const stuckDeliveries = openDeliveries.filter((d) => {
    const days = d.dispatchedAt ? Math.floor((Date.now() - d.dispatchedAt.getTime()) / 86_400_000) : null;
    return days !== null && days > 21;
  });

  if (cardCount === 0 && openOrders.length === 0) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Prepaid card stock across vessels, offices and other remote locations."
        />
        <Panel>
          <EmptyState
            title="No cards yet"
            hint="Stock enters the system by receiving a card order. You can also import a spreadsheet to load an existing position, or add cards by hand — all three write to the same ledger."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/orders/new" className="btn-primary">Order cards</Link>
                <Link href="/import" className="btn-secondary">Import a spreadsheet</Link>
                <Link href="/clients" className="btn-secondary">Set up clients</Link>
              </div>
            }
          />
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Book position on the left, physical confirmation on the right. The gap between the two is what matters when stock is not within reach."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/registrations" className="btn-secondary">Register cards</Link>
            <Link href="/stock-counts/new" className="btn-secondary">Stock count</Link>
            <Link href="/orders/new" className="btn-primary">Order cards</Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile
          label="On order"
          value={formatNumber(onOrder)}
          hint={`${openOrders.length} open order(s)`}
          tone={onOrder > 0 ? 'warn' : 'neutral'}
          href="/orders"
        />
        <StatTile label="Total cards" value={formatNumber(cardCount)} href="/cards" />
        <StatTile
          label="On hand"
          value={formatNumber(onHand)}
          hint="In stock or returned to stock"
          tone="good"
          href="/cards?status=IN_STOCK"
        />
        <StatTile
          label="With crew"
          value={formatNumber(inField)}
          hint={`${formatNumber(totals.REGISTERED)} registered`}
          href="/cards?status=ISSUED"
        />
        <StatTile
          label="Exceptions"
          value={formatNumber(exceptions)}
          hint="Lost or damaged"
          tone={exceptions > 0 ? 'danger' : 'neutral'}
          href="/cards?status=LOST"
        />
        <StatTile
          label="Unverified locations"
          value={formatNumber(staleLocations.length)}
          hint="Past their agreed count interval"
          tone={staleLocations.length > 0 ? 'warn' : 'good'}
        />
      </div>

      {(staleLocations.length > 0 ||
        lowStock.length > 0 ||
        unassigned > 0 ||
        stuckDeliveries.length > 0 ||
        stranded.length > 0) && (
        <div className="mt-4 grid gap-2">
          {stranded.length > 0 && (
            <Alert tone="danger" title="In transit with no open delivery">
              {formatNumber(stranded.length)} card(s) are marked in transit but no dispatched shipment accounts for
              them — usually short deliveries whose shipment was closed. They belong to nobody until someone chases
              them:{' '}
              {stranded
                .slice(0, 4)
                .map((c) => `${c.serial}${c.deliveryLines[0] ? ` (${c.deliveryLines[0].delivery.reference})` : ''}`)
                .join(' · ')}
              {stranded.length > 4 && ` · +${stranded.length - 4} more`}.{' '}
              <Link href="/cards?status=IN_TRANSIT" className="font-medium underline">Review them</Link>
            </Alert>
          )}
          {stuckDeliveries.length > 0 && (
            <Alert tone="danger" title="Deliveries never confirmed">
              {stuckDeliveries
                .slice(0, 5)
                .map((d) => `${d.reference} → ${d.toLocation.name}`)
                .join(' · ')}
              {stuckDeliveries.length > 5 && ` · +${stuckDeliveries.length - 5} more`}. Dispatched over three weeks ago
              and still in transit.{' '}
              <Link href="/deliveries" className="font-medium underline">Chase them</Link>
            </Alert>
          )}
          {staleLocations.length > 0 && (
            <Alert tone="warn" title="Physical count overdue">
              {staleLocations
                .slice(0, 6)
                .map((p) => `${p.name} (${p.daysSinceVerified === null ? 'never counted' : `${p.daysSinceVerified}d`})`)
                .join(' · ')}
              {staleLocations.length > 6 && ` · +${staleLocations.length - 6} more`}
              .{' '}
              <Link href="/stock-counts/new" className="font-medium underline">
                Start a count
              </Link>
            </Alert>
          )}
          {lowStock.length > 0 && (
            <Alert tone="danger" title="At or below reorder point">
              {lowStock.map((p) => `${p.name} (${p.onHand} on hand, reorder at ${p.reorderPoint})`).join(' · ')}
            </Alert>
          )}
          {unassigned > 0 && (
            <Alert tone="info" title="Cards with no location">
              {formatNumber(unassigned)} card(s) are not assigned to any location.{' '}
              <Link href="/cards?location=none" className="font-medium underline">
                Review them
              </Link>
            </Alert>
          )}
        </div>
      )}

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-3">
        <Panel
          title="Position by location"
          className="xl:col-span-2"
          action={
            <Link href="/locations" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Manage
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Location</th>
                  <th className="th">Type</th>
                  <th className="th text-right">On hand</th>
                  <th className="th text-right">With crew</th>
                  <th className="th text-right">Exceptions</th>
                  <th className="th">Last verified</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="row-hover">
                    <td className="td">
                      <Link href={`/locations/${p.id}`} className="font-medium text-slate-900 hover:underline">
                        {p.name}
                      </Link>
                      <span className="ml-1.5 text-xs text-slate-400">{p.code}</span>
                    </td>
                    <td className="td">
                      <LocationBadge type={p.type} />
                    </td>
                    <td className={`td text-right tabular-nums ${p.lowStock ? 'font-semibold text-red-700' : ''}`}>
                      {formatNumber(p.onHand)}
                    </td>
                    <td className="td text-right tabular-nums">{formatNumber(p.issued)}</td>
                    <td className={`td text-right tabular-nums ${p.exceptions > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                      {formatNumber(p.exceptions)}
                    </td>
                    <td className="td">
                      {p.daysSinceVerified === null ? (
                        <span className="text-amber-700">Never</span>
                      ) : (
                        <span className={p.stale ? 'text-amber-700' : 'text-slate-600'}>
                          {formatDate(p.lastVerifiedAt)} · {p.daysSinceVerified}d ago
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {positions.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState title="No active locations" hint="Add vessels and offices to start tracking." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid items-start gap-4">
          <Panel title="By client" action={<Link href="/clients" className="text-sm font-medium text-slate-600 hover:text-slate-900">All</Link>}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Client</th>
                    <th className="th text-right">On order</th>
                    <th className="th text-right">On hand</th>
                    <th className="th text-right">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {clientPositions.map((c) => (
                    <tr key={c.id} className="row-hover">
                      <td className="td">
                        <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:underline">{c.name}</Link>
                      </td>
                      <td className={`td text-right tabular-nums ${c.onOrder > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                        {formatNumber(c.onOrder)}
                      </td>
                      <td className="td text-right tabular-nums text-emerald-700">{formatNumber(c.onHand)}</td>
                      <td className="td text-right tabular-nums text-violet-700">{formatNumber(c.registered)}</td>
                    </tr>
                  ))}
                  {clientPositions.length === 0 && (
                    <tr><td colSpan={4}><EmptyState title="No clients yet" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {issuerBreakdown.length > 0 && (
            <Panel title="By issuer" action={<Link href="/issuers" className="text-sm font-medium text-slate-600 hover:text-slate-900">All</Link>}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Issuer</th>
                      <th className="th text-right">On hand</th>
                      <th className="th text-right">Registered</th>
                      <th className="th text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issuerBreakdown.map((i) => (
                      <tr key={i.id} className="row-hover">
                        <td className="td font-medium text-slate-900">{i.name}</td>
                        <td className="td text-right tabular-nums text-emerald-700">{formatNumber(i.onHand)}</td>
                        <td className="td text-right tabular-nums text-violet-700">{formatNumber(i.registered)}</td>
                        <td className="td text-right tabular-nums">{formatNumber(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {openOrders.length > 0 && (
            <Panel title="Open orders" action={<Link href="/orders" className="text-sm font-medium text-slate-600 hover:text-slate-900">All</Link>}>
              <ul className="divide-y divide-slate-100">
                {openOrders.slice(0, 6).map((o) => {
                  const outstanding = o.lines.reduce((a, l) => a + Math.max(0, l.quantity - l.receivedQuantity), 0);
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                      <div>
                        <Link href={`/orders/${o.id}`} className="font-medium text-slate-900 hover:underline">{o.reference}</Link>
                        <div className="text-xs text-slate-500">{o.client.name} · {o.issuer.name}</div>
                      </div>
                      <span className="text-sm font-medium tabular-nums text-amber-700">{formatNumber(outstanding)}</span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {openDeliveries.length > 0 && (
            <Panel title="In transit" action={<Link href="/deliveries" className="text-sm font-medium text-slate-600 hover:text-slate-900">All</Link>}>
              <ul className="divide-y divide-slate-100">
                {openDeliveries.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <div>
                      <Link href={`/deliveries/${d.id}`} className="font-medium text-slate-900 hover:underline">{d.reference}</Link>
                      <div className="text-xs text-slate-500">{d.fromLocation.name} → {d.toLocation.name}</div>
                    </div>
                    <span className="text-sm tabular-nums text-slate-600">{formatNumber(d._count.lines)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title="Recent activity"
            action={
              <Link href="/movements" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                All
              </Link>
            }
          >
            <ul className="divide-y divide-slate-100">
              {movements.map((m) => (
                <li key={m.id} className="px-4 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <MovementBadge type={m.type} />
                    <span className="text-xs text-slate-400">{formatDateTime(m.occurredAt)}</span>
                  </div>
                  <div className="mt-1 text-slate-700">
                    <span className="font-mono text-xs">{m.card.serial}</span>
                    {m.toLocation && <span className="text-slate-500"> → {m.toLocation.name}</span>}
                    {m.toStatus && <span className="text-slate-500"> · {m.toStatus}</span>}
                  </div>
                </li>
              ))}
              {movements.length === 0 && <li><EmptyState title="No activity yet" /></li>}
            </ul>
          </Panel>

          {openCounts.length > 0 && (
            <Panel title="Open stock counts">
              <ul className="divide-y divide-slate-100">
                {openCounts.map((c) => (
                  <li key={c.id} className="px-4 py-2 text-sm">
                    <Link href={`/stock-counts/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {c.reference}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {c.location.name} · {c.status} · {c._count.lines} line(s)
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {expiring.length > 0 && (
            <Panel title="Expiring within 90 days">
              <ul className="divide-y divide-slate-100">
                {expiring.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <div>
                      <Link href={`/cards/${c.id}`} className="font-mono text-xs text-slate-900 hover:underline">
                        {c.serial}
                      </Link>
                      <div className="text-xs text-slate-500">{c.location?.name ?? 'No location'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-700">{formatDate(c.expiryDate)}</div>
                      <StatusBadge status={c.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
