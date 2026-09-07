'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { LOCATION_TYPES, LOCATION_TYPE_LABELS } from '@/lib/constants';
import type { ActionState } from './actions';

export type LocationFormValues = {
  code?: string;
  name?: string;
  type?: string;
  region?: string | null;
  vesselImo?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  reorderPoint?: number;
  countIntervalDays?: number;
  notes?: string | null;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

export function LocationForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  values?: LocationFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="good">{state.success}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="loc-code">Code</label>
          <input id="loc-code" name="code" className="input" defaultValue={values?.code} placeholder="MV-AURORA" required />
        </div>
        <div>
          <label className="label" htmlFor="loc-type">Type</label>
          <select id="loc-type" name="type" className="input" defaultValue={values?.type ?? 'VESSEL'}>
            {LOCATION_TYPES.map((t) => (
              <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="loc-name">Name</label>
        <input id="loc-name" name="name" className="input" defaultValue={values?.name} placeholder="MV Aurora" required />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="loc-region">Region / fleet</label>
          <input id="loc-region" name="region" className="input" defaultValue={values?.region ?? ''} placeholder="Asia Pacific" />
        </div>
        <div>
          <label className="label" htmlFor="loc-imo">IMO number</label>
          <input id="loc-imo" name="vesselImo" className="input" defaultValue={values?.vesselImo ?? ''} placeholder="9123456" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="loc-contact">Contact name</label>
          <input id="loc-contact" name="contactName" className="input" defaultValue={values?.contactName ?? ''} placeholder="Chief Officer" />
        </div>
        <div>
          <label className="label" htmlFor="loc-email">Contact email</label>
          <input id="loc-email" name="contactEmail" type="email" className="input" defaultValue={values?.contactEmail ?? ''} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="loc-reorder">Reorder point</label>
          <input
            id="loc-reorder"
            name="reorderPoint"
            type="number"
            min={0}
            className="input"
            defaultValue={values?.reorderPoint ?? 0}
          />
          <p className="mt-1 text-xs text-slate-500">Alert when on-hand falls to this level. 0 disables the alert.</p>
        </div>
        <div>
          <label className="label" htmlFor="loc-interval">Count interval (days)</label>
          <input
            id="loc-interval"
            name="countIntervalDays"
            type="number"
            min={1}
            className="input"
            defaultValue={values?.countIntervalDays ?? 90}
          />
          <p className="mt-1 text-xs text-slate-500">How often this location must physically confirm its stock.</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="loc-notes">Notes</label>
        <textarea id="loc-notes" name="notes" className="input" rows={2} defaultValue={values?.notes ?? ''} />
      </div>

      <Submit label={submitLabel} />
    </form>
  );
}
