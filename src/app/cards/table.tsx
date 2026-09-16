'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, StatusBadge } from '@/components/ui';
import { CARD_STATUSES, CARD_STATUS_LABELS } from '@/lib/constants';
import { bulkIssue, bulkStatus, bulkTransfer, type ActionState } from './actions';

export type CardRow = {
  id: string;
  serial: string;
  clientName: string | null;
  clientId: string | null;
  cardholderName: string | null;
  cardholderId: string | null;
  issuerName: string;
  maskedPan: string | null;
  status: string;
  batchRef: string | null;
  issuedTo: string | null;
  cardTypeName: string;
  locationName: string | null;
  locationId: string | null;
  expiryDate: string | null;
  lastVerifiedAt: string | null;
  daysSinceVerified: number | null;
  stale: boolean;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Working…' : label}
    </button>
  );
}

export function CardsTable({
  rows,
  locations,
  cardholders,
}: {
  rows: CardRow[];
  locations: { id: string; name: string; code: string }[];
  cardholders: { id: string; label: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'none' | 'transfer' | 'status' | 'issue'>('none');

  const [transferState, transferAction] = useActionState<ActionState, FormData>(bulkTransfer, {});
  const [statusState, statusAction] = useActionState<ActionState, FormData>(bulkStatus, {});
  const [issueState, issueAction] = useActionState<ActionState, FormData>(bulkIssue, {});

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const selectedIds = useMemo(() => [...selected], [selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };

  return (
    <div>
      {selected.size > 0 && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-700">{selected.size} selected</span>
            <button type="button" className="btn-secondary" onClick={() => setMode(mode === 'transfer' ? 'none' : 'transfer')}>
              Move to location
            </button>
            <button type="button" className="btn-secondary" onClick={() => setMode(mode === 'status' ? 'none' : 'status')}>
              Change status
            </button>
            <button type="button" className="btn-secondary" onClick={() => setMode(mode === 'issue' ? 'none' : 'issue')}>
              Issue to cardholder
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setSelected(new Set()); setMode('none'); }}>
              Clear
            </button>
          </div>

          {transferState.error && <div className="mt-2"><Alert tone="danger">{transferState.error}</Alert></div>}
          {transferState.success && <div className="mt-2"><Alert tone="good">{transferState.success}</Alert></div>}
          {statusState.error && <div className="mt-2"><Alert tone="danger">{statusState.error}</Alert></div>}
          {statusState.success && <div className="mt-2"><Alert tone="good">{statusState.success}</Alert></div>}
          {issueState.error && <div className="mt-2"><Alert tone="danger">{issueState.error}</Alert></div>}
          {issueState.success && <div className="mt-2"><Alert tone="good">{issueState.success}</Alert></div>}

          {mode === 'transfer' && (
            <form action={transferAction} className="mt-3 grid gap-2 sm:grid-cols-5">
              {selectedIds.map((id) => (
                <input key={id} type="hidden" name="cardIds" value={id} />
              ))}
              <select name="toLocationId" className="input" required defaultValue="">
                <option value="" disabled>Destination…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                ))}
              </select>
              <input name="reference" className="input" placeholder="Shipment ref" />
              <input name="actor" className="input" placeholder="Your name" defaultValue="HQ" />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="markInTransit" className="h-4 w-4" defaultChecked />
                Mark in transit
              </label>
              <Submit label="Move cards" />
            </form>
          )}

          {mode === 'issue' && (
            <form action={issueAction} className="mt-3 grid gap-2 sm:grid-cols-5">
              {selectedIds.map((id) => (
                <input key={id} type="hidden" name="cardIds" value={id} />
              ))}
              <select name="cardholderId" className="input sm:col-span-2" required defaultValue="">
                <option value="" disabled>Cardholder…</option>
                {cardholders.map((h) => (
                  <option key={h.id} value={h.id}>{h.label}</option>
                ))}
              </select>
              <input name="issuedAt" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
              <input name="actor" className="input" placeholder="Your name" defaultValue="HQ" />
              <Submit label="Issue cards" />
            </form>
          )}

          {mode === 'status' && (
            <form action={statusAction} className="mt-3 grid gap-2 sm:grid-cols-4">
              {selectedIds.map((id) => (
                <input key={id} type="hidden" name="cardIds" value={id} />
              ))}
              <select name="status" className="input" required defaultValue="">
                <option value="" disabled>New status…</option>
                {CARD_STATUSES.map((s) => (
                  <option key={s} value={s}>{CARD_STATUS_LABELS[s]}</option>
                ))}
              </select>
              <input name="notes" className="input" placeholder="Reason / note" />
              <input name="actor" className="input" placeholder="Your name" defaultValue="HQ" />
              <Submit label="Apply status" />
            </form>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="th w-8">
                <input type="checkbox" className="h-4 w-4" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="th">Serial</th>
              <th className="th">Type</th>
              <th className="th">Issuer</th>
              <th className="th">Client</th>
              <th className="th">Location</th>
              <th className="th">Status</th>
              <th className="th">Cardholder</th>
              <th className="th">Batch</th>
              <th className="th">Expiry</th>
              <th className="th">Verified</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`row-hover ${selected.has(r.id) ? 'bg-slate-50' : ''}`}>
                <td className="td">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Select ${r.serial}`}
                  />
                </td>
                <td className="td">
                  <Link href={`/cards/${r.id}`} className="font-mono text-xs font-medium text-slate-900 hover:underline">
                    {r.serial}
                  </Link>
                  {r.maskedPan && <span className="ml-1.5 text-xs text-slate-400">••{r.maskedPan}</span>}
                </td>
                <td className="td text-slate-500">{r.cardTypeName}</td>
                <td className="td text-slate-500">{r.issuerName}</td>
                <td className="td text-slate-500">
                  {r.clientId ? (
                    <Link href={`/clients/${r.clientId}`} className="hover:underline">{r.clientName}</Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="td">
                  {r.locationId ? (
                    <Link href={`/locations/${r.locationId}`} className="text-slate-700 hover:underline">
                      {r.locationName}
                    </Link>
                  ) : (
                    <span className="text-amber-700">Unassigned</span>
                  )}
                </td>
                <td className="td"><StatusBadge status={r.status} /></td>
                <td className="td text-slate-500">
                  {r.cardholderId ? (
                    <Link href={`/cardholders/${r.cardholderId}`} className="hover:underline">{r.cardholderName}</Link>
                  ) : (
                    r.issuedTo ?? '—'
                  )}
                </td>
                <td className="td text-slate-500">{r.batchRef ?? '—'}</td>
                <td className="td text-slate-500">{r.expiryDate ?? '—'}</td>
                <td className="td">
                  {r.lastVerifiedAt ? (
                    <span className={r.stale ? 'text-amber-700' : 'text-slate-500'}>
                      {r.lastVerifiedAt}
                      {r.daysSinceVerified !== null && <span className="ml-1 text-xs">({r.daysSinceVerified}d)</span>}
                    </span>
                  ) : (
                    <span className="text-amber-700">Never</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
