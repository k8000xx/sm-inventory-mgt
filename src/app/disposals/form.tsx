'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import {
  DISPOSAL_METHODS,
  DISPOSAL_METHOD_LABELS,
  DISPOSAL_REASONS,
  DISPOSAL_REASON_LABELS,
} from '@/lib/constants';
import { createDisposal, type ActionState } from './actions';

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-danger" disabled={pending || disabled}>
      {pending ? 'Recording…' : 'Record disposal'}
    </button>
  );
}

export function DisposalForm({ locations }: { locations: { id: string; name: string; code: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createDisposal, {});
  const [serials, setSerials] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const count = serials.split(/[\s,;]+/).filter(Boolean).length;

  return (
    <form action={action} className="grid gap-4 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="dsp-loc">Disposed at *</label>
          <select id="dsp-loc" name="locationId" className="input" defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dsp-reason">Reason *</label>
          <select id="dsp-reason" name="reason" className="input" defaultValue="DAMAGED" required>
            {DISPOSAL_REASONS.map((r) => (
              <option key={r} value={r}>{DISPOSAL_REASON_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dsp-method">Method *</label>
          <select id="dsp-method" name="method" className="input" defaultValue="SHREDDED" required>
            {DISPOSAL_METHODS.map((m) => (
              <option key={m} value={m}>{DISPOSAL_METHOD_LABELS[m]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="dsp-serials">Serials being disposed of *</label>
        <textarea
          id="dsp-serials"
          name="serials"
          className="input font-mono"
          rows={10}
          value={serials}
          onChange={(e) => setSerials(e.target.value)}
          placeholder={'One per line.\n\n54105000001001\n54105000001002'}
          required
        />
        <p className="mt-1 text-xs text-slate-500">
          {count > 0 ? `${count} serial(s) entered. ` : ''}
          Cards already disposed of are ignored.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="dsp-date">Disposed on *</label>
          <input id="dsp-date" name="disposedAt" type="date" className="input" defaultValue={today} required />
        </div>
        <div>
          <label className="label" htmlFor="dsp-by">Disposed by *</label>
          <input id="dsp-by" name="disposedBy" className="input" placeholder="Operations" required />
        </div>
        <div>
          <label className="label" htmlFor="dsp-witness">Witnessed by</label>
          <input id="dsp-witness" name="witnessedBy" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="dsp-cert">Certificate reference</label>
          <input id="dsp-cert" name="certificateRef" className="input" placeholder="Destruction cert no." />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="dsp-ref">Reference</label>
          <input id="dsp-ref" name="reference" className="input" placeholder="Auto-generated if blank" />
        </div>
        <div>
          <label className="label" htmlFor="dsp-notes">Notes</label>
          <input id="dsp-notes" name="notes" className="input" />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          These cards have been physically destroyed or returned.
          <span className="block text-xs text-slate-500">
            Disposal is terminal. The cards leave inventory for good, and a mistake is corrected by a new movement
            rather than by editing this record.
          </span>
        </span>
      </label>

      <div><Submit disabled={!confirmed || count === 0} /></div>
    </form>
  );
}
