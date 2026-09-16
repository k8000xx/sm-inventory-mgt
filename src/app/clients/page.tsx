import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getClientPositions } from '@/lib/queries';
import { formatNumber } from '@/lib/format';
import { EmptyState, PageHeader, Panel } from '@/components/ui';
import { ClientForm } from './form';
import { createClient, setClientActive } from './actions';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const [positions, inactive] = await Promise.all([
    getClientPositions(),
    prisma.client.findMany({ where: { isActive: false }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <PageHeader
        title="Clients"
        description="The customers you run card programmes for. Cards belong to a client from the moment they are ordered, so every figure here is that client's own stock."
      />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid items-start gap-4 xl:col-span-2">
          <Panel title="Active clients">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Client</th>
                    <th className="th">Country</th>
                    <th className="th text-right">On order</th>
                    <th className="th text-right">On hand</th>
                    <th className="th text-right">In transit</th>
                    <th className="th text-right">Issued</th>
                    <th className="th text-right">Registered</th>
                    <th className="th text-right">Vessels</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((c) => (
                    <tr key={c.id} className="row-hover">
                      <td className="td">
                        <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:underline">
                          {c.name}
                        </Link>
                        <span className="ml-1.5 text-xs text-slate-400">{c.code}</span>
                      </td>
                      <td className="td text-slate-500">{c.country ?? '—'}</td>
                      <td className={`td text-right tabular-nums ${c.onOrder > 0 ? 'text-sky-700' : 'text-slate-400'}`}>
                        {formatNumber(c.onOrder)}
                      </td>
                      <td className="td text-right font-medium tabular-nums text-emerald-700">{formatNumber(c.onHand)}</td>
                      <td className="td text-right tabular-nums text-slate-500">{formatNumber(c.inTransit)}</td>
                      <td className="td text-right tabular-nums">{formatNumber(c.issued)}</td>
                      <td className="td text-right tabular-nums text-violet-700">{formatNumber(c.registered)}</td>
                      <td className="td text-right tabular-nums text-slate-500">{formatNumber(c.locations)}</td>
                      <td className="td text-right">
                        <form
                          action={async () => {
                            'use server';
                            await setClientActive(c.id, false);
                          }}
                        >
                          <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-900">
                            Archive
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {positions.length === 0 && (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState title="No clients yet" hint="Add your first client on the right, then order cards for them." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {inactive.length > 0 && (
            <Panel title="Archived">
              <ul className="divide-y divide-slate-100">
                {inactive.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-slate-600">
                      {c.name} <span className="text-xs text-slate-400">{c.code}</span>
                    </span>
                    <form
                      action={async () => {
                        'use server';
                        await setClientActive(c.id, true);
                      }}
                    >
                      <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-900">Restore</button>
                    </form>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel title="Add a client">
          <ClientForm action={createClient} submitLabel="Add client" />
        </Panel>
      </div>
    </>
  );
}
