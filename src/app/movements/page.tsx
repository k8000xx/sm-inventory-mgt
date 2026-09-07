import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS } from '@/lib/constants';
import { formatDateTime, formatNumber } from '@/lib/format';
import { EmptyState, MovementBadge, PageHeader, Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 150;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function MovementsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const type = first(sp.type);
  const location = first(sp.location);
  const q = first(sp.q).trim();
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const where: Prisma.MovementWhereInput = {};
  if (type) where.type = type;
  if (location) where.OR = [{ fromLocationId: location }, { toLocationId: location }];
  if (q) where.card = { serial: { contains: q } };

  const [movements, total, locations] = await Promise.all([
    prisma.movement.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        card: { select: { id: true, serial: true } },
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
        stockCount: { select: { id: true, reference: true } },
        importBatch: { select: { filename: true } },
      },
    }),
    prisma.movement.count({ where }),
    prisma.location.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({ ...(type && { type }), ...(location && { location }), ...(q && { q }), ...extra }).toString();

  return (
    <>
      <PageHeader
        title="Movement ledger"
        description={`${formatNumber(total)} entries. Every change to a card — manual, imported or from a stock count — is recorded here.`}
      />

      <Panel className="mb-4">
        <form className="grid gap-2 p-4 md:grid-cols-4">
          <input name="q" className="input" placeholder="Card serial…" defaultValue={q} />
          <select name="type" className="input" defaultValue={type}>
            <option value="">Any movement type</option>
            {MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>{MOVEMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <select name="location" className="input" defaultValue={location}>
            <option value="">Any location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary">Filter</button>
        </form>
      </Panel>

      <Panel>
        {movements.length === 0 ? (
          <EmptyState title="No movements match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">When</th>
                  <th className="th">Type</th>
                  <th className="th">Card</th>
                  <th className="th">From</th>
                  <th className="th">To</th>
                  <th className="th">Status change</th>
                  <th className="th">By</th>
                  <th className="th">Source</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="row-hover">
                    <td className="td text-slate-500">{formatDateTime(m.occurredAt)}</td>
                    <td className="td"><MovementBadge type={m.type} /></td>
                    <td className="td">
                      <Link href={`/cards/${m.card.id}`} className="font-mono text-xs text-slate-900 hover:underline">
                        {m.card.serial}
                      </Link>
                    </td>
                    <td className="td text-slate-500">{m.fromLocation?.name ?? '—'}</td>
                    <td className="td text-slate-500">{m.toLocation?.name ?? '—'}</td>
                    <td className="td text-slate-500">
                      {m.fromStatus && m.toStatus ? `${m.fromStatus} → ${m.toStatus}` : (m.toStatus ?? '—')}
                    </td>
                    <td className="td text-slate-500">{m.actor}</td>
                    <td className="td text-slate-500">
                      {m.stockCount ? (
                        <Link href={`/stock-counts/${m.stockCount.id}`} className="hover:underline">
                          {m.stockCount.reference}
                        </Link>
                      ) : (
                        m.importBatch?.filename ?? m.reference ?? '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>Page {page} of {pageCount}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/movements?${qs({ page: String(page - 1) })}`} className="btn-secondary">Previous</Link>}
            {page < pageCount && <Link href={`/movements?${qs({ page: String(page + 1) })}`} className="btn-secondary">Next</Link>}
          </div>
        </div>
      )}
    </>
  );
}
