import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatDate, formatNumber } from '@/lib/format';
import { Alert, EmptyState, PageHeader, Panel } from '@/components/ui';
import { RegistrationForm } from './form';

export const dynamic = 'force-dynamic';

export default async function RegistrationsPage() {
  const batches = await prisma.registrationBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <>
      <PageHeader
        title="Registrations"
        description="Record cards that have gone live. Registering a card removes it from available stock automatically — no separate adjustment needed."
      />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid items-start gap-4 xl:col-span-2">
          <Panel title="Register cards">
            <RegistrationForm />
          </Panel>

          {batches.length > 0 && (
            <Panel title="Recent batches">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Reference</th>
                      <th className="th">Registered on</th>
                      <th className="th">By</th>
                      <th className="th">Source</th>
                      <th className="th text-right">Submitted</th>
                      <th className="th text-right">Registered</th>
                      <th className="th text-right">Skipped</th>
                      <th className="th text-right">Rejected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id} className="row-hover">
                        <td className="td">
                          <Link href={`/registrations/${b.id}`} className="font-medium text-slate-900 hover:underline">
                            {b.reference}
                          </Link>
                        </td>
                        <td className="td text-slate-500">{formatDate(b.registeredOn)}</td>
                        <td className="td text-slate-500">{b.recordedBy}</td>
                        <td className="td text-slate-500">{b.source}</td>
                        <td className="td text-right tabular-nums">{formatNumber(b.linesTotal)}</td>
                        <td className="td text-right tabular-nums text-violet-700">{formatNumber(b.linesRegistered)}</td>
                        <td className={`td text-right tabular-nums ${b.linesSkipped > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                          {formatNumber(b.linesSkipped)}
                        </td>
                        <td className={`td text-right tabular-nums ${b.linesRejected > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                          {formatNumber(b.linesRejected)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          {batches.length === 0 && (
            <Panel><EmptyState title="No registrations recorded yet" hint="Paste a batch of serials above to get started." /></Panel>
          )}
        </div>

        <div className="grid items-start gap-4">
          <Panel title="What registering does">
            <div className="space-y-3 p-4 text-sm text-slate-600">
              <p>
                A registered card is live with a cardholder, so it stops counting as available stock the moment it is
                recorded here. That is the deduction — it happens by itself.
              </p>
              <p>
                Registration reports usually arrive from the issuer after the fact, so a card still sitting as{' '}
                <strong>in stock</strong> or <strong>in transit</strong> is registered anyway rather than rejected. The
                issuer knows better than the book does, and the movement ledger keeps the correction visible.
              </p>
              <p className="text-slate-500">
                Cards that are already gone — disposed, lost or expired — are rejected and listed, so you can chase
                them rather than silently overwriting their history.
              </p>
            </div>
          </Panel>
          <Alert tone="info">
            Add a crew or employee reference after each serial and the cardholder is linked at the same time.
          </Alert>
        </div>
      </div>
    </>
  );
}
