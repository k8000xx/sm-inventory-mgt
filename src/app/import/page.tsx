import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Alert, PageHeader, Panel } from '@/components/ui';
import { ImportWizard } from './wizard';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const [locations, cardTypes, clients, issuers, savedMappings, history] = await Promise.all([
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.cardType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.issuer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.importMapping.findMany({ orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, mappingJson: true } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  return (
    <>
      <PageHeader
        title="Import spreadsheet"
        description="Load a report from a vessel or office. Columns are matched automatically where possible; you confirm the mapping and preview every change before anything is saved."
        action={<Link href="/api/template" className="btn-secondary">Download blank template</Link>}
      />

      <div className="mb-4">
        <Alert tone="info" title="Nothing is written until you commit">
          The preview step runs the full import in memory and reports exactly what would change. Card numbers are
          reduced to their last 4 digits on the way in — the full PAN is never stored.
        </Alert>
      </div>

      <ImportWizard
        locations={locations}
        cardTypes={cardTypes}
        clients={clients}
        issuers={issuers}
        savedMappings={savedMappings}
      />

      {history.length > 0 && (
        <div className="mt-6">
          <Panel title="Recent imports">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">File</th>
                    <th className="th">Sheet</th>
                    <th className="th">By</th>
                    <th className="th">Mode</th>
                    <th className="th text-right">Rows</th>
                    <th className="th text-right">Created</th>
                    <th className="th text-right">Updated</th>
                    <th className="th text-right">Skipped</th>
                    <th className="th">When</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((b) => (
                    <tr key={b.id} className="row-hover">
                      <td className="td font-medium text-slate-900">{b.filename}</td>
                      <td className="td text-slate-500">{b.sheetName ?? '—'}</td>
                      <td className="td text-slate-500">{b.uploadedBy}</td>
                      <td className="td text-slate-500">{b.mode}</td>
                      <td className="td text-right tabular-nums">{formatNumber(b.rowsTotal)}</td>
                      <td className="td text-right tabular-nums text-emerald-700">{formatNumber(b.rowsCreated)}</td>
                      <td className="td text-right tabular-nums text-sky-700">{formatNumber(b.rowsUpdated)}</td>
                      <td className="td text-right tabular-nums text-amber-700">{formatNumber(b.rowsSkipped)}</td>
                      <td className="td text-slate-500">{formatDateTime(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
