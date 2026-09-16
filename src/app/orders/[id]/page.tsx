import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/constants';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { parseSerialRange, serialAt } from '@/lib/serials';
import { Alert, EmptyState, PageHeader, Panel, StatTile } from '@/components/ui';
import { ReceiveAllForm, ReceiveLineForm } from './receive-form';
import { cancelOrder, deleteDraftOrder, setOrderStatus } from '../actions';

export const dynamic = 'force-dynamic';

const NEXT_STATUS: Record<string, { to: string; label: string } | undefined> = {
  DRAFT: { to: 'SUBMITTED', label: 'Mark submitted' },
  SUBMITTED: { to: 'IN_PRODUCTION', label: 'Mark in production' },
  IN_PRODUCTION: { to: 'SHIPPED', label: 'Mark shipped' },
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await prisma.cardOrder.findUnique({
    where: { id },
    include: {
      client: true,
      issuer: true,
      deliverToLocation: true,
      lines: { include: { cardType: true, _count: { select: { cards: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) notFound();

  const ordered = order.lines.reduce((a, l) => a + l.quantity, 0);
  const received = order.lines.reduce((a, l) => a + l.receivedQuantity, 0);
  const outstanding = Math.max(0, ordered - received);
  const cardsCreated = order.lines.reduce((a, l) => a + l._count.cards, 0);
  const isOpen = order.status !== 'CANCELLED' && outstanding > 0;
  const next = NEXT_STATUS[order.status];

  return (
    <>
      <PageHeader
        title={order.reference}
        description={`${order.client.name} · ${order.issuer.name} · deliver to ${order.deliverToLocation.name}`}
        action={
          <div className="flex flex-wrap gap-2">
            {cardsCreated > 0 && (
              <Link href={`/cards?order=${order.id}`} className="btn-secondary">View cards</Link>
            )}
            {next && order.status !== 'CANCELLED' && (
              <form
                action={async () => {
                  'use server';
                  await setOrderStatus(order.id, next.to);
                }}
              >
                <button type="submit" className="btn-secondary">{next.label}</button>
              </form>
            )}
            <Link href="/orders" className="btn-secondary">Back to orders</Link>
          </div>
        }
      />

      <div className="mb-4">
        {order.status === 'CANCELLED' ? (
          <Alert tone="warn" title="Cancelled">This order was cancelled and will not bring stock in.</Alert>
        ) : order.status === 'RECEIVED' ? (
          <Alert tone="good" title="Received in full">
            All {formatNumber(ordered)} card(s) have been booked into inventory at {order.deliverToLocation.name}.
          </Alert>
        ) : (
          <Alert tone="info" title="Awaiting receipt">
            {formatNumber(outstanding)} card(s) are still on order. They do not count as stock until booked in below.
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Ordered" value={formatNumber(ordered)} />
        <StatTile label="Received" value={formatNumber(received)} tone={received > 0 ? 'good' : 'neutral'} />
        <StatTile label="Outstanding" value={formatNumber(outstanding)} tone={outstanding > 0 ? 'warn' : 'good'} />
        <StatTile label="Order date" value={formatDate(order.orderedAt)} hint={`by ${order.placedBy}`} />
        <StatTile
          label="Status"
          value={ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
          hint={order.expectedAt ? `Expected ${formatDate(order.expectedAt)}` : undefined}
        />
      </div>

      {isOpen && (
        <div className="mt-4">
          <Panel title="Receive this order">
            <ReceiveAllForm orderId={order.id} outstanding={outstanding} />
          </Panel>
        </div>
      )}

      <div className="mt-4 grid gap-4">
        {order.lines.map((line, index) => {
          const range = parseSerialRange(line.serialStart, line.serialEnd);
          const lineOutstanding = Math.max(0, line.quantity - line.receivedQuantity);
          const nextSerial =
            range.ok && lineOutstanding > 0 ? serialAt(range.info, line.receivedQuantity) : null;

          return (
            <Panel
              key={line.id}
              title={`Line ${index + 1} — ${line.cardType.name}`}
              action={
                <span className="text-sm text-slate-500">
                  {formatNumber(line.receivedQuantity)} of {formatNumber(line.quantity)} received
                </span>
              }
            >
              <div className="grid gap-3 p-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Serial range</div>
                  <div className="font-mono text-sm text-slate-800">{line.serialStart}</div>
                  <div className="font-mono text-sm text-slate-800">{line.serialEnd}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Quantity</div>
                  <div className="text-sm text-slate-800">{formatNumber(line.quantity)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Batch</div>
                  <div className="text-sm text-slate-800">{line.batchRef ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Expiry</div>
                  <div className="text-sm text-slate-800">{formatDate(line.expiryDate)}</div>
                </div>
                {!range.ok && (
                  <div className="sm:col-span-4">
                    <Alert tone="danger">{range.error}</Alert>
                  </div>
                )}
                {line.notes && <div className="sm:col-span-4 text-sm text-slate-500">{line.notes}</div>}
              </div>

              {order.status !== 'CANCELLED' && lineOutstanding > 0 && range.ok && (
                <ReceiveLineForm lineId={line.id} outstanding={lineOutstanding} nextSerial={nextSerial} />
              )}
              {lineOutstanding === 0 && (
                <div className="border-t border-slate-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                  Fully received — {formatNumber(line._count.cards)} card(s) in inventory from this line.
                </div>
              )}
            </Panel>
          );
        })}
        {order.lines.length === 0 && (
          <Panel><EmptyState title="This order has no lines" /></Panel>
        )}
      </div>

      {order.notes && (
        <div className="mt-4">
          <Panel title="Notes"><p className="px-4 py-3 text-sm text-slate-600">{order.notes}</p></Panel>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {received === 0 && order.status !== 'CANCELLED' && (
          <form
            action={async () => {
              'use server';
              await cancelOrder(order.id);
            }}
          >
            <button type="submit" className="btn-danger">Cancel order</button>
          </form>
        )}
        {received === 0 && (order.status === 'DRAFT' || order.status === 'CANCELLED') && (
          <form
            action={async () => {
              'use server';
              await deleteDraftOrder(order.id);
            }}
          >
            <button type="submit" className="btn-danger">Delete order</button>
          </form>
        )}
      </div>
      {received > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Cards have been booked in against this order, so it can no longer be cancelled or deleted — that would orphan
          real stock. Created {formatDateTime(order.createdAt)}.
        </p>
      )}
    </>
  );
}
