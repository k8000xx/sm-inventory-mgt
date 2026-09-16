'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import type { ActionState } from './actions';

export type CardholderFormValues = {
  clientId?: string;
  ref?: string;
  firstName?: string;
  lastName?: string;
  rank?: string | null;
  nationality?: string | null;
  email?: string | null;
  phone?: string | null;
  locationId?: string | null;
  notes?: string | null;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

export function CardholderForm({
  action,
  values,
  clients,
  locations,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  values?: CardholderFormValues;
  clients: { id: string; name: string; code: string }[];
  locations: { id: string; name: string; code: string; clientId: string | null }[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="good">{state.success}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ch-client">Client *</label>
          <select id="ch-client" name="clientId" className="input" defaultValue={values?.clientId ?? ''} required>
            <option value="" disabled>Choose…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ch-ref">Crew / employee reference *</label>
          <input id="ch-ref" name="ref" className="input font-mono" defaultValue={values?.ref} placeholder="CRW-04821" required />
          <p className="mt-1 text-xs text-slate-500">Unique within the client. Used to match registrations and imports.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ch-first">First name *</label>
          <input id="ch-first" name="firstName" className="input" defaultValue={values?.firstName} required />
        </div>
        <div>
          <label className="label" htmlFor="ch-last">Last name *</label>
          <input id="ch-last" name="lastName" className="input" defaultValue={values?.lastName} required />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="ch-rank">Rank</label>
          <input id="ch-rank" name="rank" className="input" defaultValue={values?.rank ?? ''} placeholder="Second Officer" />
        </div>
        <div>
          <label className="label" htmlFor="ch-nat">Nationality</label>
          <input id="ch-nat" name="nationality" className="input" defaultValue={values?.nationality ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="ch-loc">Assigned to</label>
          <select id="ch-loc" name="locationId" className="input" defaultValue={values?.locationId ?? ''}>
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ch-email">Email</label>
          <input id="ch-email" name="email" type="email" className="input" defaultValue={values?.email ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="ch-phone">Phone</label>
          <input id="ch-phone" name="phone" className="input" defaultValue={values?.phone ?? ''} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="ch-notes">Notes</label>
        <textarea id="ch-notes" name="notes" className="input" rows={2} defaultValue={values?.notes ?? ''} />
      </div>

      <Submit label={submitLabel} />
    </form>
  );
}
