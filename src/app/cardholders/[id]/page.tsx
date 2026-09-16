import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { EmptyState, MovementBadge, PageHeader, Panel, StatTile, StatusBadge } from '@/components/ui';
import { CardholderForm } from '../form';
import { setCardholderActive, updateCardholder } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CardholderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const holder = await prisma.cardholder.findUnique({
    where: { id },
    include: { client: true, location: true },
  });
  if (!holder) notFound();

  const [cards, clients, locations, movements] = await Promise.all([
    prisma.card.findMany({
      where: { cardholderId: id },
      include: { cardType: { include: { issuer: true } }, location: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, clientId: true } }),
    prisma.movement.findMany({
      where: { card: { cardholderId: id } },
      include: { card: { select: { id: true, serial: true } }, toLocation: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 20,
    }),
  ]);

  const live = cards.filter((c) => c.status === 'REGISTERED').length;
  const held = cards.filter((c) => c.status === 'ISSUED').length;

  return (
    <>
      <PageHeader
        title={`${holder.firstName} ${holder.lastName}`}
        description={`${holder.ref} · ${holder.client.name}${holder.rank ? ` · ${holder.rank}` : ''}${holder.location ? ` · ${holder.location.name}` : ''}`}
        action={
          <div className="flex gap-2">
            <form
              action={async () => {
                'use server';
                await setCardholderActive(holder.id, !holder.isActive);
              }}
            >
              <button type="submit" className="btn-secondary">
                {holder.isActive ? 'Mark inactive' : 'Reactivate'}
              </button>
            </form>
            <Link href="/cardholders" className="btn-secondary">Back</Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Cards held" value={formatNumber(cards.length)} hint="Now and historically" />
        <StatTile label="Registered" value={formatNumber(live)} tone={live > 0 ? 'good' : 'neutral'} />
        <StatTile label="Issued, not registered" value={formatNumber(held)} tone={held > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Nationality" value={holder.nationality ?? '—'} />
      </div>

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-3">
        <div className="grid items-start gap-4 xl:col-span-2">
          <Panel title="Card history">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Serial</th>
                    <th className="th">Product</th>
                    <th className="th">Issuer</th>
                    <th className="th">Status</th>
                    <th className="th">Issued</th>
                    <th className="th">Registered</th>
                    <th className="th">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c) => (
                    <tr key={c.id} className="row-hover">
                      <td className="td">
                        <Link href={`/cards/${c.id}`} className="font-mono text-xs text-slate-900 hover:underline">{c.serial}</Link>
                      </td>
                      <td className="td text-slate-500">{c.cardType.name}</td>
                      <td className="td text-slate-500">{c.cardType.issuer.name}</td>
                      <td className="td"><StatusBadge status={c.status} /></td>
                      <td className="td text-slate-500">{formatDate(c.issuedAt)}</td>
                      <td className="td text-slate-500">{formatDate(c.registeredAt)}</td>
                      <td className="td text-slate-500">{formatDate(c.expiryDate)}</td>
                    </tr>
                  ))}
                  {cards.length === 0 && (
                    <tr><td colSpan={7}><EmptyState title="No cards issued to this person yet" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Edit cardholder">
            <CardholderForm
              action={updateCardholder.bind(null, holder.id)}
              values={holder}
              clients={clients}
              locations={locations}
              submitLabel="Save changes"
            />
          </Panel>
        </div>

        <Panel title="Activity">
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
                {m.notes && <div className="text-xs text-slate-500">{m.notes}</div>}
              </li>
            ))}
            {movements.length === 0 && <li><EmptyState title="No activity yet" /></li>}
          </ul>
        </Panel>
      </div>
    </>
  );
}
