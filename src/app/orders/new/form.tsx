'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { parseSerialRange } from '@/lib/serials';
import { createOrder, type ActionState } from '../actions';

type Option = { id: string; name: string; code: string };
type TypeOption = Option & { issuerId: string; issuerName: string };

type Line = {
  cardTypeId: string;
  serialStart: string;
  serialEnd: string;
  batchRef: string;
  expiryDate: string;
  notes: string;
};

const emptyLine: Line = { cardTypeId: '', serialStart: '', serialEnd: '', batchRef: '', expiryDate: '', notes: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : 'Create order'}
    </button>
  );
}

export function OrderForm({
  clients,
  issuers,
  cardTypes,
  locations,
  defaultClientId,
}: {
  clients: Option[];
  issuers: Option[];
  cardTypes: TypeOption[];
  locations: Option[];
  defaultClientId?: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(createOrder, {});
  const [issuerId, setIssuerId] = useState(issuers[0]?.id ?? '');
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const today = new Date().toISOString().slice(0, 10);

  // Products are issuer-specific, so the line dropdowns follow the chosen issuer.
  const availableTypes = useMemo(
    () => cardTypes.filter((t) => !issuerId || t.issuerId === issuerId),
    [cardTypes, issuerId],
  );

  const setLine = (index: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const ranges = lines.map((l) =>
    l.serialStart && l.serialEnd ? parseSerialRange(l.serialStart, l.serialEnd) : null,
  );
  const totalQuantity = ranges.reduce((acc, r) => acc + (r && r.ok ? r.info.count : 0), 0);
  const hasRangeError = ranges.some((r) => r !== null && !r.ok);
  const complete = lines.every((l) => l.cardTypeId && l.serialStart && l.serialEnd);

  return (
    <form action={action} className="grid gap-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="panel">
        <div className="panel-header"><h2 className="panel-title">Order details</h2></div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="or-client">Client *</label>
            <select id="or-client" name="clientId" className="input" defaultValue={defaultClientId ?? ''} required>
              <option value="" disabled>Choose…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="or-issuer">Issuer *</label>
            <select
              id="or-issuer"
              name="issuerId"
              className="input"
              value={issuerId}
              onChange={(e) => {
                setIssuerId(e.target.value);
                // Products from the old issuer no longer apply.
                setLines((prev) => prev.map((l) => ({ ...l, cardTypeId: '' })));
              }}
              required
            >
              <option value="" disabled>Choose…</option>
              {issuers.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="or-deliver">Deliver to *</label>
            <select id="or-deliver" name="deliverToLocationId" className="input" defaultValue="" required>
              <option value="" disabled>Choose…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Where the cards land when the order arrives.</p>
          </div>

          <div>
            <label className="label" htmlFor="or-ref">Reference</label>
            <input id="or-ref" name="reference" className="input" placeholder="Auto-generated if blank" />
          </div>
          <div>
            <label className="label" htmlFor="or-date">Order date *</label>
            <input id="or-date" name="orderedAt" type="date" className="input" defaultValue={today} required />
          </div>
          <div>
            <label className="label" htmlFor="or-expected">Expected</label>
            <input id="or-expected" name="expectedAt" type="date" className="input" />
          </div>

          <div>
            <label className="label" htmlFor="or-by">Placed by</label>
            <input id="or-by" name="placedBy" className="input" defaultValue="HQ" />
          </div>
          <div>
            <label className="label" htmlFor="or-status">Status</label>
            <select id="or-status" name="status" className="input" defaultValue="SUBMITTED">
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="IN_PRODUCTION">In production</option>
              <option value="SHIPPED">Shipped</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="or-notes">Notes</label>
            <input id="or-notes" name="notes" className="input" />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Order lines</h2>
          <span className="text-sm text-slate-500">
            {formatNumber(totalQuantity)} card(s) across {lines.length} line(s)
          </span>
        </div>

        <div className="space-y-3 p-4">
          {availableTypes.length === 0 && (
            <Alert tone="warn">
              This issuer has no card types yet. Add one under Card types before ordering.
            </Alert>
          )}

          {lines.map((line, i) => {
            const range = ranges[i];
            return (
              <div key={i} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line {i + 1}</span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-700 underline"
                      onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="label">Card type *</label>
                    <select
                      className="input"
                      value={line.cardTypeId}
                      onChange={(e) => setLine(i, { cardTypeId: e.target.value })}
                      required
                    >
                      <option value="" disabled>Choose…</option>
                      {availableTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">First serial *</label>
                    <input
                      className="input font-mono"
                      value={line.serialStart}
                      onChange={(e) => setLine(i, { serialStart: e.target.value })}
                      placeholder="54105000001001"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Last serial *</label>
                    <input
                      className="input font-mono"
                      value={line.serialEnd}
                      onChange={(e) => setLine(i, { serialEnd: e.target.value })}
                      placeholder="54105000002000"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Batch ref</label>
                    <input className="input" value={line.batchRef} onChange={(e) => setLine(i, { batchRef: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Expiry date</label>
                    <input type="date" className="input" value={line.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Notes</label>
                    <input className="input" value={line.notes} onChange={(e) => setLine(i, { notes: e.target.value })} />
                  </div>
                </div>

                <div className="mt-2 text-sm">
                  {range === null && <span className="text-slate-400">Enter both serials to see the quantity.</span>}
                  {range && range.ok && (
                    <span className="font-medium text-emerald-700">
                      {formatNumber(range.info.count)} card(s) — {line.serialStart} through {line.serialEnd}
                    </span>
                  )}
                  {range && !range.ok && <span className="font-medium text-red-700">{range.error}</span>}
                </div>
              </div>
            );
          })}

          <button type="button" className="btn-secondary" onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}>
            Add another line
          </button>
        </div>

        <input
          type="hidden"
          name="lines"
          value={JSON.stringify(
            lines.map((l) => ({
              cardTypeId: l.cardTypeId,
              serialStart: l.serialStart,
              serialEnd: l.serialEnd,
              batchRef: l.batchRef || undefined,
              expiryDate: l.expiryDate || undefined,
              notes: l.notes || undefined,
            })),
          )}
        />

        <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-3">
          <Submit />
          {(hasRangeError || !complete) && (
            <span className="text-sm text-slate-500">
              {hasRangeError ? 'Fix the serial ranges above.' : 'Fill in every line before saving.'}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
