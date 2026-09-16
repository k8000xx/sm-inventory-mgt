import { prisma } from '@/lib/db';
import { formatNumber } from '@/lib/format';
import { EmptyState, PageHeader, Panel } from '@/components/ui';
import { IssuerForm } from './form';
import { toggleIssuer } from './actions';

export const dynamic = 'force-dynamic';

export default async function IssuersPage() {
  const issuers = await prisma.issuer.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { cardTypes: true, orders: true } },
      cardTypes: { select: { _count: { select: { cards: true } } } },
    },
  });

  return (
    <>
      <PageHeader
        title="Issuers"
        description="The banks and processors behind your products — Monavate, FAB, and whoever comes next. Every card type belongs to one, and every order is placed with one."
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel title="Issuers" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th">Contact</th>
                  <th className="th text-right">Products</th>
                  <th className="th text-right">Cards</th>
                  <th className="th text-right">Orders</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {issuers.map((i) => {
                  const cards = i.cardTypes.reduce((a, t) => a + t._count.cards, 0);
                  return (
                    <tr key={i.id} className="row-hover">
                      <td className="td font-mono text-xs">{i.code}</td>
                      <td className="td font-medium text-slate-900">
                        {i.name}
                        {i.description && <div className="text-xs font-normal text-slate-500">{i.description}</div>}
                      </td>
                      <td className="td text-slate-500">
                        {i.contactName ?? '—'}
                        {i.contactEmail && <div className="text-xs">{i.contactEmail}</div>}
                      </td>
                      <td className="td text-right tabular-nums">{formatNumber(i._count.cardTypes)}</td>
                      <td className="td text-right tabular-nums">{formatNumber(cards)}</td>
                      <td className="td text-right tabular-nums">{formatNumber(i._count.orders)}</td>
                      <td className="td">
                        <form
                          action={async () => {
                            'use server';
                            await toggleIssuer(i.id, !i.isActive);
                          }}
                        >
                          <button type="submit" className="text-xs font-medium text-slate-600 underline hover:text-slate-900">
                            {i.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {issuers.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState title="No issuers yet" hint="Add Monavate and FAB to get started." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Add an issuer">
          <IssuerForm />
        </Panel>
      </div>
    </>
  );
}
