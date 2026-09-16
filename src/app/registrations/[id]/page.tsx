import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { REGISTRATION_RESULT_LABELS, type RegistrationResult } from '@/lib/constants';
import { formatDate, formatNumber } from '@/lib/format';
import { Alert, EmptyState, PageHeader, Panel, StatTile } from '@/components/ui';

export const dynamic = 'force-dynamic';

const RESULT_TONES: Record<string, string> = {
  REGISTERED: 'text-violet-700',
  ALREADY_REGISTERED: 'text-slate-500',
  NOT_FOUND: 'text-amber-700',
  REJECTED: 'text-red-700',
};

export default async function RegistrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const batch = await prisma.registrationBatch.findUnique({
    where: { id },
    include: { lines: { orderBy: [{ result: 'asc' }, { serial: 'asc' }] } },
  });
  if (!batch) notFound();

  const needsAttention = batch.lines.filter((l) => l.result === 'NOT_FOUND' || l.result === 'REJECTED');

  return (
    <>
      <PageHeader
        title={batch.reference}
        description={`Registered ${formatDate(batch.registeredOn)} · recorded by ${batch.recordedBy} · source ${batch.source}`}
        action={<Link href="/registrations" className="btn-secondary">Back to registrations</Link>}
      />

      <div className="mb-4">
        {batch.linesRegistered > 0 ? (
          <Alert tone="good" title="Inventory updated">
            {formatNumber(batch.linesRegistered)} card(s) were registered and are no longer counted as available stock.
          </Alert>
        ) : (
          <Alert tone="warn" title="Nothing registered">
            No cards in this batch changed state. The lines below explain why.
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Submitted" value={formatNumber(batch.linesTotal)} />
        <StatTile label="Registered" value={formatNumber(batch.linesRegistered)} tone="good" />
        <StatTile
          label="Skipped"
          value={formatNumber(batch.linesSkipped)}
          hint="Already registered or unknown serial"
          tone={batch.linesSkipped > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          label="Rejected"
          value={formatNumber(batch.linesRejected)}
          hint="Card already out of circulation"
          tone={batch.linesRejected > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {needsAttention.length > 0 && (
        <div className="mt-4">
          <Panel title={`Needs attention — ${formatNumber(needsAttention.length)}`}>
            <div className="max-h-80 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="th">Serial</th>
                    <th className="th">Outcome</th>
                    <th className="th">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {needsAttention.map((l) => (
                    <tr key={l.id} className="row-hover">
                      <td className="td font-mono text-xs">{l.serial}</td>
                      <td className={`td text-xs font-semibold ${RESULT_TONES[l.result] ?? ''}`}>
                        {REGISTRATION_RESULT_LABELS[l.result as RegistrationResult] ?? l.result}
                      </td>
                      <td className="td text-slate-600">{l.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      <div className="mt-4">
        <Panel title="All lines">
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="th">Serial</th>
                  <th className="th">Outcome</th>
                  <th className="th">Cardholder ref</th>
                  <th className="th">Note</th>
                </tr>
              </thead>
              <tbody>
                {batch.lines.map((l) => (
                  <tr key={l.id} className="row-hover">
                    <td className="td">
                      {l.cardId ? (
                        <Link href={`/cards/${l.cardId}`} className="font-mono text-xs text-slate-900 hover:underline">
                          {l.serial}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-slate-700">{l.serial}</span>
                      )}
                    </td>
                    <td className={`td text-xs font-semibold ${RESULT_TONES[l.result] ?? ''}`}>
                      {REGISTRATION_RESULT_LABELS[l.result as RegistrationResult] ?? l.result}
                    </td>
                    <td className="td font-mono text-xs text-slate-500">{l.cardholderRef ?? '—'}</td>
                    <td className="td text-slate-500">{l.note ?? '—'}</td>
                  </tr>
                ))}
                {batch.lines.length === 0 && (
                  <tr><td colSpan={4}><EmptyState title="No lines in this batch" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {batch.notes && (
        <div className="mt-4">
          <Panel title="Notes"><p className="px-4 py-3 text-sm text-slate-600">{batch.notes}</p></Panel>
        </div>
      )}
    </>
  );
}
