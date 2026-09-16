import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from '@/lib/constants';
import { daysSince, formatDate, formatNumber } from '@/lib/format';
import { Alert, EmptyState, PageHeader, Panel, StatTile, StatusBadge } from '@/components/ui';
import { ConfirmReceiptForm, DispatchForm } from './forms';
import { cancelDeliveryAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const delivery = await prisma.delivery.findUnique({
    where: { id },
    include: {
      fromLocation: true,
      toLocation: true,
      client: true,
      lines: {
        include: { card: { include: { cardType: { select: { name: true } } } } },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!delivery) notFound();

  const received = delivery.lines.filter((l) => l.received).length;
  const inFlight = delivery.status === 'DISPATCHED' ? daysSince(delivery.dispatchedAt) : null;

  return (
    <>
      <PageHeader
        title={delivery.reference}
        description={`${delivery.fromLocation.name} → ${delivery.toLocation.name}${delivery.client ? ` · ${delivery.client.name}` : ''}`}
        action={<Link href="/deliveries" className="btn-secondary">Back to deliveries</Link>}
      />

      <div className="mb-4">
        {delivery.status === 'DRAFT' && (
          <Alert tone="info" title="Not yet dispatched">
            The manifest is built but nothing has moved. Dispatching marks these cards in transit.
          </Alert>
        )}
        {delivery.status === 'DISPATCHED' && (
          <Alert tone="warn" title="In transit">
            These cards left {delivery.fromLocation.name} on {formatDate(delivery.dispatchedAt)}
            {inFlight !== null && ` — ${inFlight} day(s) ago`}. They are not yet on {delivery.toLocation.name}&rsquo;s
            books and will not be, until receipt is confirmed below.
          </Alert>
        )}
        {delivery.status === 'RECEIVED' && (
          <Alert tone="good" title="Delivered onboard">
            {formatNumber(received)} of {formatNumber(delivery.lines.length)} card(s) confirmed at{' '}
            {delivery.toLocation.name} on {formatDate(delivery.receivedAt)} by {delivery.receivedBy}.
          </Alert>
        )}
        {delivery.status === 'CANCELLED' && (
          <Alert tone="warn" title="Cancelled">This delivery was cancelled and its cards returned to stock.</Alert>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="On manifest" value={formatNumber(delivery.lines.length)} />
        <StatTile label="Confirmed" value={formatNumber(received)} tone={received > 0 ? 'good' : 'neutral'} />
        <StatTile
          label="Short"
          value={formatNumber(delivery.status === 'RECEIVED' ? delivery.lines.length - received : 0)}
          tone={delivery.status === 'RECEIVED' && delivery.lines.length - received > 0 ? 'danger' : 'neutral'}
        />
        <StatTile label="Carrier" value={delivery.carrier ?? '—'} hint={delivery.trackingRef ?? undefined} />
        <StatTile
          label="Status"
          value={DELIVERY_STATUS_LABELS[delivery.status as DeliveryStatus] ?? delivery.status}
          hint={delivery.expectedAt ? `Expected ${formatDate(delivery.expectedAt)}` : undefined}
        />
      </div>

      {delivery.status === 'DRAFT' && (
        <div className="mt-4">
          <Panel title="Dispatch">
            <DispatchForm deliveryId={delivery.id} count={delivery.lines.length} />
          </Panel>
        </div>
      )}

      {delivery.status === 'DISPATCHED' && (
        <div className="mt-4">
          <Panel title="Confirm receipt onboard">
            <ConfirmReceiptForm
              deliveryId={delivery.id}
              destination={delivery.toLocation.name}
              rows={delivery.lines.map((l) => ({
                cardId: l.cardId,
                serial: l.card.serial,
                cardType: l.card.cardType.name,
              }))}
            />
          </Panel>
        </div>
      )}

      <div className="mt-4">
        <Panel title="Manifest">
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="th">Serial</th>
                  <th className="th">Product</th>
                  <th className="th">Current status</th>
                  <th className="th">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {delivery.lines.map((l) => (
                  <tr key={l.id} className="row-hover">
                    <td className="td">
                      <Link href={`/cards/${l.cardId}`} className="font-mono text-xs text-slate-900 hover:underline">
                        {l.card.serial}
                      </Link>
                    </td>
                    <td className="td text-slate-500">{l.card.cardType.name}</td>
                    <td className="td"><StatusBadge status={l.card.status} /></td>
                    <td className="td text-sm">
                      {delivery.status === 'RECEIVED' ? (
                        l.received ? (
                          <span className="font-medium text-emerald-700">Received</span>
                        ) : (
                          <span className="font-medium text-red-700">{l.note ?? 'Not received'}</span>
                        )
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {delivery.lines.length === 0 && (
                  <tr><td colSpan={4}><EmptyState title="Nothing on this manifest" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {delivery.notes && (
        <div className="mt-4">
          <Panel title="Notes"><p className="px-4 py-3 text-sm text-slate-600">{delivery.notes}</p></Panel>
        </div>
      )}

      {delivery.status !== 'RECEIVED' && delivery.status !== 'CANCELLED' && (
        <div className="mt-6">
          <form
            action={async () => {
              'use server';
              await cancelDeliveryAction(delivery.id);
            }}
          >
            <button type="submit" className="btn-danger">Cancel delivery</button>
          </form>
          <p className="mt-1 text-xs text-slate-500">
            Cancelling returns any dispatched cards to stock at {delivery.fromLocation.name}.
          </p>
        </div>
      )}
    </>
  );
}
