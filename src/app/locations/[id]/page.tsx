import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ON_HAND_STATUSES } from '@/lib/constants';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  Alert,
  EmptyState,
  LocationBadge,
  MovementBadge,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
} from '@/components/ui';
import { LocationForm } from '../form';
import { updateLocation } from '../actions';

export const dynamic = 'force-dynamic';

export default async function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const location = await prisma.location.findUnique({ where: { id }, include: { client: true } });
  if (!location) notFound();

  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });

  const [byStatus, verifiedAgg, recentCards, movements, counts] = await Promise.all([
    prisma.card.groupBy({ by: ['status'], where: { locationId: id }, _count: { _all: true } }),
    prisma.card.aggregate({ where: { locationId: id }, _max: { lastVerifiedAt: true } }),
    prisma.card.findMany({
      where: { locationId: id },
      include: { cardType: true },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    }),
    prisma.movement.findMany({
      where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
      include: { card: { select: { serial: true, id: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 15,
    }),
    prisma.stockCount.findMany({
      where: { locationId: id },
      orderBy: { countDate: 'desc' },
      take: 10,
      include: { _count: { select: { lines: true } } },
    }),
  ]);

  const counted = new Map(byStatus.map((g) => [g.status, g._count._all]));
  const onHand = ON_HAND_STATUSES.reduce((acc, s) => acc + (counted.get(s) ?? 0), 0);
  const total = byStatus.reduce((acc, g) => acc + g._count._all, 0);
  const lastVerifiedAt = verifiedAgg._max.lastVerifiedAt;
  const daysSince = lastVerifiedAt
    ? Math.floor((Date.now() - lastVerifiedAt.getTime()) / 86_400_000)
    : null;
  const stale = total > 0 && (daysSince === null || daysSince > location.countIntervalDays);

  return (
    <>
      <PageHeader
        title={location.name}
        description={`${location.code}${location.client ? ` · ${location.client.name}` : ''}${location.region ? ` · ${location.region}` : ''}${location.vesselImo ? ` · IMO ${location.vesselImo}` : ''}`}
        action={
          <div className="flex gap-2">
            <Link href={`/cards?location=${location.id}`} className="btn-secondary">
              View all cards
            </Link>
            <Link href={`/stock-counts/new?location=${location.id}`} className="btn-primary">
              Start stock count
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <LocationBadge type={location.type} />
        {!location.isActive && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
            Archived
          </span>
        )}
      </div>

      {stale && (
        <div className="mb-4">
          <Alert tone="warn" title="Physical count overdue">
            {daysSince === null
              ? 'Nothing at this location has ever been physically confirmed.'
              : `Last confirmed ${daysSince} days ago; the agreed interval is ${location.countIntervalDays} days.`}{' '}
            The figures below are the book position, not a verified one.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="On hand" value={formatNumber(onHand)} tone={onHand <= location.reorderPoint && location.reorderPoint > 0 ? 'danger' : 'good'} hint={location.reorderPoint > 0 ? `Reorder at ${location.reorderPoint}` : undefined} />
        <StatTile label="Issued / activated" value={formatNumber((counted.get('ISSUED') ?? 0) + (counted.get('ACTIVATED') ?? 0))} />
        <StatTile label="Exceptions" value={formatNumber((counted.get('LOST') ?? 0) + (counted.get('DAMAGED') ?? 0))} tone={(counted.get('LOST') ?? 0) + (counted.get('DAMAGED') ?? 0) > 0 ? 'danger' : 'neutral'} />
        <StatTile label="Last verified" value={lastVerifiedAt ? formatDate(lastVerifiedAt) : 'Never'} tone={stale ? 'warn' : 'good'} hint={daysSince !== null ? `${daysSince} days ago` : undefined} />
      </div>

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-3">
        <div className="grid gap-4 xl:col-span-2">
          <Panel title="Cards here" action={<Link href={`/cards?location=${location.id}`} className="text-sm font-medium text-slate-600 hover:text-slate-900">All</Link>}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Serial</th>
                    <th className="th">Type</th>
                    <th className="th">Status</th>
                    <th className="th">Issued to</th>
                    <th className="th">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCards.map((c) => (
                    <tr key={c.id} className="row-hover">
                      <td className="td">
                        <Link href={`/cards/${c.id}`} className="font-mono text-xs text-slate-900 hover:underline">
                          {c.serial}
                        </Link>
                      </td>
                      <td className="td text-slate-500">{c.cardType.name}</td>
                      <td className="td"><StatusBadge status={c.status} /></td>
                      <td className="td text-slate-500">{c.issuedTo ?? '—'}</td>
                      <td className="td text-slate-500">{formatDate(c.lastVerifiedAt)}</td>
                    </tr>
                  ))}
                  {recentCards.length === 0 && (
                    <tr><td colSpan={5}><EmptyState title="No cards at this location" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Stock counts">
            <ul className="divide-y divide-slate-100">
              {counts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <div>
                    <Link href={`/stock-counts/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {c.reference}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {formatDate(c.countDate)} · counted by {c.countedBy} · {c._count.lines} line(s)
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-600">{c.status}</span>
                </li>
              ))}
              {counts.length === 0 && <li><EmptyState title="No stock counts recorded" hint="A count is how this location's book position gets confirmed." /></li>}
            </ul>
          </Panel>
        </div>

        <div className="grid gap-4">
          <Panel title="Edit location">
            <LocationForm
              action={updateLocation.bind(null, location.id)}
              values={location}
              clients={clients}
              submitLabel="Save changes"
            />
          </Panel>

          <Panel title="Movement history">
            <ul className="divide-y divide-slate-100">
              {movements.map((m) => (
                <li key={m.id} className="px-4 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <MovementBadge type={m.type} />
                    <span className="text-xs text-slate-400">{formatDateTime(m.occurredAt)}</span>
                  </div>
                  <Link href={`/cards/${m.card.id}`} className="mt-1 block font-mono text-xs text-slate-700 hover:underline">
                    {m.card.serial}
                  </Link>
                </li>
              ))}
              {movements.length === 0 && <li><EmptyState title="No movements yet" /></li>}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
