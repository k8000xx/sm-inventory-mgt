import { prisma } from '@/lib/db';
import { formatNumber } from '@/lib/format';
import { EmptyState, PageHeader, Panel } from '@/components/ui';
import { CardTypeForm } from './form';
import { toggleCardType } from './actions';

export const dynamic = 'force-dynamic';

export default async function CardTypesPage() {
  const types = await prisma.cardType.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { cards: true } } },
  });

  return (
    <>
      <PageHeader
        title="Card types"
        description="The products you stock. Imports match a spreadsheet's card-type column against these codes and names."
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel title="Existing types" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th">Currency</th>
                  <th className="th text-right">Cards</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} className="row-hover">
                    <td className="td font-mono text-xs">{t.code}</td>
                    <td className="td font-medium text-slate-900">
                      {t.name}
                      {t.description && <div className="text-xs font-normal text-slate-500">{t.description}</div>}
                    </td>
                    <td className="td">{t.currency}</td>
                    <td className="td text-right tabular-nums">{formatNumber(t._count.cards)}</td>
                    <td className="td">
                      <form
                        action={async () => {
                          'use server';
                          await toggleCardType(t.id, !t.isActive);
                        }}
                      >
                        <button type="submit" className="text-xs font-medium text-slate-600 underline hover:text-slate-900">
                          {t.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {types.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title="No card types yet"
                        hint="Add at least one before importing, or let the importer create them from your spreadsheet."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Add a card type">
          <CardTypeForm />
        </Panel>
      </div>
    </>
  );
}
