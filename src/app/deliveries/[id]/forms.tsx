'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { confirmReceiptAction, dispatchAction, type ActionState } from '../actions';

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

export function DispatchForm({ deliveryId, count }: { deliveryId: string; count: number }) {
  const [state, action] = useActionState<ActionState, FormData>(dispatchAction.bind(null, deliveryId), {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="grid gap-3 p-4 sm:grid-cols-4 sm:items-end">
      {state.error && <div className="sm:col-span-4"><Alert tone="danger">{state.error}</Alert></div>}
      {state.success && <div className="sm:col-span-4"><Alert tone="good">{state.success}</Alert></div>}
      <div>
        <label className="label" htmlFor="dp-date">Dispatched on</label>
        <input id="dp-date" name="dispatchedAt" type="date" className="input" defaultValue={today} />
      </div>
      <div>
        <label className="label" htmlFor="dp-by">Dispatched by</label>
        <input id="dp-by" name="actor" className="input" defaultValue="HQ" />
      </div>
      <div className="sm:col-span-2">
        <Submit label={`Dispatch ${count} card(s)`} busy="Dispatching…" />
      </div>
    </form>
  );
}

export type ManifestRow = { cardId: string; serial: string; cardType: string };

export function ConfirmReceiptForm({
  deliveryId,
  rows,
  destination,
}: {
  deliveryId: string;
  rows: ManifestRow[];
  destination: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(confirmReceiptAction.bind(null, deliveryId), {});
  const [selected, setSelected] = useState<Set<string>>(new Set(rows.map((r) => r.cardId)));
  const today = new Date().toISOString().slice(0, 10);

  const allOn = selected.size === rows.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={action} className="grid gap-3 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="good">{state.success}</Alert>}

      <p className="text-sm text-slate-600">
        Tick everything that physically arrived at <strong>{destination}</strong>. Anything left unticked stays in
        transit and is reported as short-delivered.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={() => setSelected(new Set(rows.map((r) => r.cardId)))}>
          All arrived
        </button>
        <button type="button" className="btn-secondary" onClick={() => setSelected(new Set())}>
          Clear
        </button>
        <span className="text-sm text-slate-500">
          {selected.size} of {rows.length} ticked
        </span>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200">
        <table className="w-full">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="th w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allOn}
                  onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.cardId)))}
                  aria-label="Toggle all"
                />
              </th>
              <th className="th">Serial</th>
              <th className="th">Product</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cardId} className="row-hover">
                <td className="td">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selected.has(r.cardId)}
                    onChange={() => toggle(r.cardId)}
                    aria-label={`Received ${r.serial}`}
                  />
                </td>
                <td className="td font-mono text-xs">{r.serial}</td>
                <td className="td text-slate-500">{r.cardType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {[...selected].map((id) => (
        <input key={id} type="hidden" name="receivedCardIds" value={id} />
      ))}

      <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <div>
          <label className="label" htmlFor="cr-date">Received on</label>
          <input id="cr-date" name="receivedAt" type="date" className="input" defaultValue={today} />
        </div>
        <div>
          <label className="label" htmlFor="cr-by">Confirmed by *</label>
          <input id="cr-by" name="actor" className="input" placeholder="Chief Officer" required />
        </div>
        <div>
          <label className="label" htmlFor="cr-notes">Notes</label>
          <input id="cr-notes" name="notes" className="input" />
        </div>
        <div>
          <Submit label={`Confirm ${selected.size} received`} busy="Confirming…" />
        </div>
      </div>
    </form>
  );
}
