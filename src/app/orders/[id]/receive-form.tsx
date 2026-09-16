'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { receiveAllAction, receiveLineAction, type ActionState } from '../actions';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Booking in…' : label}
    </button>
  );
}

/** Book in part or all of a single order line. */
export function ReceiveLineForm({
  lineId,
  outstanding,
  nextSerial,
}: {
  lineId: string;
  outstanding: number;
  nextSerial: string | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(receiveLineAction.bind(null, lineId), {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="grid gap-2 border-t border-slate-100 bg-slate-50 p-3 sm:grid-cols-5 sm:items-end">
      {state.error && <div className="sm:col-span-5"><Alert tone="danger">{state.error}</Alert></div>}
      {state.success && <div className="sm:col-span-5"><Alert tone="good">{state.success}</Alert></div>}

      <div>
        <label className="label">Quantity</label>
        <input
          name="quantity"
          type="number"
          min={1}
          max={outstanding}
          className="input"
          defaultValue={outstanding}
        />
      </div>
      <div>
        <label className="label">Received on</label>
        <input name="receivedAt" type="date" className="input" defaultValue={today} />
      </div>
      <div>
        <label className="label">Received by</label>
        <input name="actor" className="input" defaultValue="HQ" />
      </div>
      <div className="sm:col-span-2">
        <Submit label={`Book in ${outstanding}`} />
        {nextSerial && (
          <p className="mt-1 text-xs text-slate-500">Continues from {nextSerial}.</p>
        )}
      </div>
    </form>
  );
}

/** Book in every outstanding line at once. */
export function ReceiveAllForm({ orderId, outstanding }: { orderId: string; outstanding: number }) {
  const [state, action] = useActionState<ActionState, FormData>(receiveAllAction.bind(null, orderId), {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="grid gap-3 p-4 sm:grid-cols-4 sm:items-end">
      {state.error && <div className="sm:col-span-4"><Alert tone="danger">{state.error}</Alert></div>}
      {state.success && <div className="sm:col-span-4"><Alert tone="good">{state.success}</Alert></div>}

      <div>
        <label className="label" htmlFor="ra-date">Received on</label>
        <input id="ra-date" name="receivedAt" type="date" className="input" defaultValue={today} />
      </div>
      <div>
        <label className="label" htmlFor="ra-by">Received by</label>
        <input id="ra-by" name="actor" className="input" defaultValue="HQ" />
      </div>
      <div className="sm:col-span-2">
        <Submit label={`Book in all ${outstanding} card(s)`} />
        <p className="mt-1 text-xs text-slate-500">
          Creates a card record for every serial in the outstanding ranges, at the delivery location.
        </p>
      </div>
    </form>
  );
}
