import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { DISPOSAL_METHOD_LABELS, DISPOSAL_REASON_LABELS, type DisposalMethod, type DisposalReason } from '@/lib/constants';
import { formatDate, formatNumber } from '@/lib/format';
import { EmptyState, PageHeader, Panel, StatTile } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DisposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const disposal = await prisma.disposal.findUnique({
    where: { id },
    include: {
      location: true,
      lines: {
        include: {
          card: {
            include: {
              cardType: { include: { issuer: { select: { name: true } } } },
              client: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!disposal) notFound();

  return (
    <>
      <PageHeader
        title={disposal.reference}
        description={`${disposal.location.name} · ${formatDate(disposal.disposedAt)} · by ${disposal.disposedBy}`}
        action={<Link href="/disposals" className="btn-secondary">Back to disposals</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Cards disposed" value={formatNumber(disposal.lines.length)} />
        <StatTile label="Reason" value={DISPOSAL_REASON_LABELS[disposal.reason as DisposalReason] ?? disposal.reason} />
        <StatTile label="Method" value={DISPOSAL_METHOD_LABELS[disposal.method as DisposalMethod] ?? disposal.method} />
        <StatTile label="Witnessed by" value={disposal.witnessedBy ?? '—'} />
        <StatTile label="Certificate" value={disposal.certificateRef ?? '—'} />
      </div>

      <div className="mt-4">
        <Panel title="Cards">
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="th">Serial</th>
                  <th className="th">Product</th>
                  <th className="th">Issuer</th>
                  <th className="th">Client</th>
                </tr>
              </thead>
              <tbody>
                {disposal.lines.map((l) => (
                  <tr key={l.id} className="row-hover">
                    <td className="td">
                      <Link href={`/cards/${l.cardId}`} className="font-mono text-xs text-slate-900 hover:underline">
                        {l.card.serial}
                      </Link>
                    </td>
                    <td className="td text-slate-500">{l.card.cardType.name}</td>
                    <td className="td text-slate-500">{l.card.cardType.issuer.name}</td>
                    <td className="td text-slate-500">
                      {l.card.client ? (
                        <Link href={`/clients/${l.card.client.id}`} className="hover:underline">{l.card.client.name}</Link>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {disposal.lines.length === 0 && (
                  <tr><td colSpan={4}><EmptyState title="No cards on this disposal" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {disposal.notes && (
        <div className="mt-4">
          <Panel title="Notes"><p className="px-4 py-3 text-sm text-slate-600">{disposal.notes}</p></Panel>
        </div>
      )}
    </>
  );
}
