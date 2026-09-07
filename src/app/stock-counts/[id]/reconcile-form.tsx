'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { reconcile, type ActionState } from '../actions';

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending || disabled}>
      {pending ? 'Applying…' : 'Apply corrections'}
    </button>
  );
}

export function ReconcileForm({
  countId,
  cardTypes,
  missingCount,
  unexpectedCount,
  unknownCount,
}: {
  countId: string;
  cardTypes: { id: string; name: string }[];
  missingCount: number;
  unexpectedCount: number;
  unknownCount: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(reconcile.bind(null, countId), {});
  const [createUnknown, setCreateUnknown] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={action} className="grid gap-4 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="good">{state.success}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rec-missing">
            Cards the system expected but nobody found ({missingCount})
          </label>
          <select id="rec-missing" name="missingAction" className="input" defaultValue="LEAVE">
            <option value="LEAVE">Leave as-is and investigate</option>
            <option value="LOST">Mark them lost</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="rec-unexpected">
            Cards found here that the system had elsewhere ({unexpectedCount})
          </label>
          <select id="rec-unexpected" name="unexpectedAction" className="input" defaultValue="MOVE">
            <option value="MOVE">Move them to this location and mark in stock</option>
            <option value="LEAVE">Leave as-is and investigate</option>
          </select>
        </div>
      </div>

      {unknownCount > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="createUnknown"
              className="mt-0.5 h-4 w-4"
              checked={createUnknown}
              onChange={(e) => setCreateUnknown(e.target.checked)}
            />
            <span>
              Create records for the {unknownCount} counted serial(s) the system has never seen
              <span className="block text-xs text-slate-500">
                Only do this if you are satisfied the serials are genuine and not typos.
              </span>
            </span>
          </label>
          {createUnknown && (
            <div className="mt-3 max-w-sm">
              <label className="label" htmlFor="rec-type">Card type for the new records</label>
              <select id="rec-type" name="unknownCardTypeId" className="input" defaultValue="" required>
                <option value="" disabled>Choose…</option>
                {cardTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="max-w-sm">
        <label className="label" htmlFor="rec-actor">Approved by</label>
        <input id="rec-actor" name="actor" className="input" defaultValue="HQ" required />
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I have reviewed the variances above.
          <span className="block text-xs text-slate-500">
            Applying writes movements against every affected card and closes this count. It cannot be undone from the
            app — later corrections have to be made as new movements.
          </span>
        </span>
      </label>

      <div>
        <Submit disabled={!confirmed} />
      </div>
    </form>
  );
}
