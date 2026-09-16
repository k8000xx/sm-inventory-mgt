import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { DEFAULT_STALE_DAYS } from '@/lib/constants';
import { daysSince, formatDate, formatDateTime } from '@/lib/format';
import { Alert, MovementBadge, PageHeader, Panel, StatusBadge } from '@/components/ui';
import { CardForm } from '../form';
import { updateCard } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      cardType: { include: { issuer: true } },
      location: true,
      client: true,
      cardholder: true,
      orderLine: { include: { order: { select: { id: true, reference: true } } } },
    },
  });
  if (!card) notFound();

  const [movements, locations, cardTypes, countLines, clients, cardholders] = await Promise.all([
    prisma.movement.findMany({
      where: { cardId: id },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
        importBatch: { select: { id: true, filename: true } },
        stockCount: { select: { id: true, reference: true } },
      },
    }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.cardType.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.stockCountLine.findMany({
      where: { cardId: id },
      include: { stockCount: { select: { id: true, reference: true, countDate: true, location: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.cardholder.findMany({
      where: { isActive: true, ...(card.clientId ? { clientId: card.clientId } : {}) },
      orderBy: { lastName: 'asc' },
      take: 500,
      select: { id: true, firstName: true, lastName: true, ref: true },
    }),
  ]);

  const verifiedDays = daysSince(card.lastVerifiedAt);
  const stale = verifiedDays === null || verifiedDays > (card.location?.countIntervalDays ?? DEFAULT_STALE_DAYS);

  const facts: [string, React.ReactNode][] = [
    ['Card type', card.cardType.name],
    ['Issuer', card.cardType.issuer.name],
    ['BIN', card.cardType.bin ?? '—'],
    ['Currency', card.cardType.currency],
    [
      'Client',
      card.client ? (
        <Link href={`/clients/${card.client.id}`} className="hover:underline">{card.client.name}</Link>
      ) : (
        <span className="text-amber-700">Unassigned</span>
      ),
    ],
    [
      'Cardholder',
      card.cardholder ? (
        <Link href={`/cardholders/${card.cardholder.id}`} className="hover:underline">
          {card.cardholder.lastName}, {card.cardholder.firstName}
        </Link>
      ) : (
        card.issuedTo ?? '—'
      ),
    ],
    ['Location', card.location ? <Link href={`/locations/${card.location.id}`} className="hover:underline">{card.location.name}</Link> : <span className="text-amber-700">Unassigned</span>],
    ['Status', <StatusBadge key="s" status={card.status} />],
    ['Card number', card.maskedPan ? `•••• ${card.maskedPan}` : '—'],
    ['Proxy', card.proxy ?? '—'],
    ['Batch', card.batchRef ?? '—'],
    ['Issue date', formatDate(card.issuedAt)],
    ['Delivered onboard', formatDate(card.deliveredAt)],
    [
      'From order',
      card.orderLine ? (
        <Link href={`/orders/${card.orderLine.order.id}`} className="hover:underline">
          {card.orderLine.order.reference}
        </Link>
      ) : (
        '—'
      ),
    ],
    ['Registered', formatDate(card.registeredAt)],
    ['Expiry', formatDate(card.expiryDate)],
    ['Last verified', card.lastVerifiedAt ? `${formatDate(card.lastVerifiedAt)} by ${card.lastVerifiedBy ?? 'unknown'}` : 'Never'],
    ['Created', formatDateTime(card.createdAt)],
  ];

  if (card.disposedAt) {
    facts.push(['Disposed', `${formatDate(card.disposedAt)}${card.disposalReason ? ` (${card.disposalReason})` : ''}`]);
  }

  return (
    <>
      <PageHeader
        title={card.serial}
        description={card.notes ?? undefined}
        action={<Link href="/cards" className="btn-secondary">Back to cards</Link>}
      />

      {stale && card.status !== 'DISPOSED' && card.status !== 'REGISTERED' && (
        <div className="mb-4">
          <Alert tone="warn" title="Not recently verified">
            {verifiedDays === null
              ? 'Nobody has physically confirmed this card since it entered the system.'
              : `Last physically confirmed ${verifiedDays} days ago.`}{' '}
            Its location below is the system's belief, not a confirmed fact.
          </Alert>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Details">
          <dl className="divide-y divide-slate-100">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="text-right text-sm text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Edit card" className="xl:col-span-2">
          <CardForm
            action={updateCard.bind(null, card.id)}
            values={card}
            locations={locations}
            cardTypes={cardTypes}
            clients={clients}
            cardholders={cardholders.map((h) => ({ id: h.id, label: `${h.lastName}, ${h.firstName} (${h.ref})` }))}
            submitLabel="Save changes"
          />
        </Panel>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Movement history" className="xl:col-span-2">
          <ol className="divide-y divide-slate-100">
            {movements.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MovementBadge type={m.type} />
                    <span className="text-sm text-slate-700">
                      {m.fromLocation?.name && <span>{m.fromLocation.name} → </span>}
                      {m.toLocation?.name ?? (m.fromLocation ? 'Unassigned' : '')}
                      {m.fromStatus && m.toStatus && (
                        <span className="text-slate-500">
                          {m.fromLocation || m.toLocation ? ' · ' : ''}
                          {m.fromStatus} → {m.toStatus}
                        </span>
                      )}
                      {!m.fromStatus && m.toStatus && !m.fromLocation && (
                        <span className="text-slate-500">{m.toLocation ? ' · ' : ''}{m.toStatus}</span>
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{formatDateTime(m.occurredAt)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  by {m.actor}
                  {m.reference && <> · ref {m.reference}</>}
                  {m.importBatch && <> · import {m.importBatch.filename}</>}
                  {m.stockCount && (
                    <> · <Link href={`/stock-counts/${m.stockCount.id}`} className="underline">count {m.stockCount.reference}</Link></>
                  )}
                  {m.notes && <> · {m.notes}</>}
                </div>
              </li>
            ))}
            {movements.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No movements recorded.</li>}
          </ol>
        </Panel>

        <Panel title="Seen in stock counts">
          <ul className="divide-y divide-slate-100">
            {countLines.map((l) => (
              <li key={l.id} className="px-4 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/stock-counts/${l.stockCount.id}`} className="font-medium text-slate-900 hover:underline">
                    {l.stockCount.reference}
                  </Link>
                  <span
                    className={`text-xs font-medium ${
                      l.result === 'MATCH' ? 'text-emerald-700' : l.result === 'MISSING' ? 'text-red-700' : 'text-amber-700'
                    }`}
                  >
                    {l.result}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {l.stockCount.location.name} · {formatDate(l.stockCount.countDate)}
                  {l.resolution && <> · {l.resolution}</>}
                </div>
              </li>
            ))}
            {countLines.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-500">Never included in a stock count.</li>
            )}
          </ul>
        </Panel>
      </div>
    </>
  );
}
