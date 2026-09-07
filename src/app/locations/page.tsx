import Link from 'next/link';
import { getLocationPositions } from '@/lib/queries';
import { prisma } from '@/lib/db';
import { formatDate, formatNumber } from '@/lib/format';
import { EmptyState, LocationBadge, PageHeader, Panel } from '@/components/ui';
import { LocationForm } from './form';
import { createLocation, setLocationActive } from './actions';

export const dynamic = 'force-dynamic';

export default async function LocationsPage() {
  const [positions, inactive] = await Promise.all([
    getLocationPositions(),
    prisma.location.findMany({ where: { isActive: false }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <PageHeader
        title="Locations"
        description="Vessels, offices, warehouses and agents holding stock. The count interval drives the overdue-verification alerts on the dashboard."
      />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid gap-4 xl:col-span-2">
          <Panel title="Active locations">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Location</th>
                    <th className="th">Type</th>
                    <th className="th">Region</th>
                    <th className="th text-right">On hand</th>
                    <th className="th text-right">Total</th>
                    <th className="th">Last verified</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id} className="row-hover">
                      <td className="td">
                        <Link href={`/locations/${p.id}`} className="font-medium text-slate-900 hover:underline">
                          {p.name}
                        </Link>
                        <span className="ml-1.5 text-xs text-slate-400">{p.code}</span>
                      </td>
                      <td className="td"><LocationBadge type={p.type} /></td>
                      <td className="td text-slate-500">{p.region ?? '—'}</td>
                      <td className={`td text-right tabular-nums ${p.lowStock ? 'font-semibold text-red-700' : ''}`}>
                        {formatNumber(p.onHand)}
                      </td>
                      <td className="td text-right tabular-nums">{formatNumber(p.total)}</td>
                      <td className="td">
                        {p.daysSinceVerified === null ? (
                          <span className="text-amber-700">Never</span>
                        ) : (
                          <span className={p.stale ? 'text-amber-700' : 'text-slate-600'}>
                            {formatDate(p.lastVerifiedAt)}
                          </span>
                        )}
                      </td>
                      <td className="td text-right">
                        <form
                          action={async () => {
                            'use server';
                            await setLocationActive(p.id, false);
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
                      <td colSpan={7}>
                        <EmptyState title="No locations yet" hint="Add your first vessel or office on the right." />
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
                {inactive.map((l) => (
                  <li key={l.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-slate-600">
                      {l.name} <span className="text-xs text-slate-400">{l.code}</span>
                    </span>
                    <form
                      action={async () => {
                        'use server';
                        await setLocationActive(l.id, true);
                      }}
                    >
                      <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-900">
                        Restore
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel title="Add a location">
          <LocationForm action={createLocation} submitLabel="Add location" />
        </Panel>
      </div>
    </>
  );
}
