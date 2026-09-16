import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { formatNumber } from '@/lib/format';
import { Alert, EmptyState, PageHeader, Panel } from '@/components/ui';
import { CardholderForm } from './form';
import { createCardholder } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function CardholdersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const clientId = first(sp.client);

  const where: Prisma.CardholderWhereInput = {};
  if (clientId) where.clientId = clientId;
  if (q) {
    where.OR = [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { ref: { contains: q } },
      { email: { contains: q } },
    ];
  }

  const [holders, clients, locations, total] = await Promise.all([
    prisma.cardholder.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        location: { select: { name: true } },
        _count: { select: { cards: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 200,
    }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, clientId: true } }),
    prisma.cardholder.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Cardholders"
        description={`${formatNumber(total)} on file. The seafarers and staff cards are issued to, with every card each person has held.`}
      />

      {clients.length === 0 ? (
        <Panel>
          <EmptyState
            title="Add a client first"
            hint="Cardholders belong to a client, so set one up before adding people."
            action={<Link href="/clients" className="btn-primary">Go to clients</Link>}
          />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-3">
          <div className="grid items-start gap-4 xl:col-span-2">
            <Panel>
              <form className="grid gap-2 p-4 md:grid-cols-4">
                <input name="q" className="input md:col-span-2" placeholder="Name, reference or email…" defaultValue={q} />
                <select name="client" className="input" defaultValue={clientId}>
                  <option value="">Any client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button type="submit" className="btn-primary">Filter</button>
              </form>
            </Panel>

            <Panel title="People">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Name</th>
                      <th className="th">Reference</th>
                      <th className="th">Client</th>
                      <th className="th">Rank</th>
                      <th className="th">Assigned to</th>
                      <th className="th text-right">Cards</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.map((h) => (
                      <tr key={h.id} className="row-hover">
                        <td className="td">
                          <Link href={`/cardholders/${h.id}`} className="font-medium text-slate-900 hover:underline">
                            {h.lastName}, {h.firstName}
                          </Link>
                          {!h.isActive && <span className="ml-1.5 text-xs text-slate-400">(inactive)</span>}
                        </td>
                        <td className="td font-mono text-xs text-slate-500">{h.ref}</td>
                        <td className="td text-slate-500">
                          <Link href={`/clients/${h.client.id}`} className="hover:underline">{h.client.name}</Link>
                        </td>
                        <td className="td text-slate-500">{h.rank ?? '—'}</td>
                        <td className="td text-slate-500">{h.location?.name ?? '—'}</td>
                        <td className="td text-right tabular-nums">{formatNumber(h._count.cards)}</td>
                      </tr>
                    ))}
                    {holders.length === 0 && (
                      <tr><td colSpan={6}><EmptyState title="No cardholders match" hint="Add one on the right." /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="grid items-start gap-4">
            <Alert tone="info" title="Personal data">
              These records hold names and contact details. Keep the app behind your own access controls, and only
              record what card administration actually needs.
            </Alert>
            <Panel title="Add a cardholder">
              <CardholderForm action={createCardholder} clients={clients} locations={locations} submitLabel="Add cardholder" />
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
