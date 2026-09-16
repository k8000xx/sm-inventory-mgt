'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { CARD_STATUSES, CARD_STATUS_LABELS } from '@/lib/constants';
import type { ActionState } from './actions';

export type CardFormValues = {
  serial?: string;
  cardTypeId?: string;
  status?: string;
  locationId?: string | null;
  clientId?: string | null;
  cardholderId?: string | null;
  proxy?: string | null;
  maskedPan?: string | null;
  batchRef?: string | null;
  issuedTo?: string | null;
  expiryDate?: Date | string | null;
  issuedAt?: Date | string | null;
  registeredAt?: Date | string | null;
  notes?: string | null;
};

const asDateInput = (v: Date | string | null | undefined) => {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

export function CardForm({
  action,
  values,
  locations,
  cardTypes,
  clients,
  cardholders,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  values?: CardFormValues;
  locations: { id: string; name: string; code: string }[];
  cardTypes: { id: string; name: string }[];
  clients: { id: string; name: string; code: string }[];
  cardholders: { id: string; label: string }[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="good">{state.success}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-serial">Serial *</label>
          <input id="c-serial" name="serial" className="input font-mono" defaultValue={values?.serial} required />
        </div>
        <div>
          <label className="label" htmlFor="c-type">Card type *</label>
          <select id="c-type" name="cardTypeId" className="input" defaultValue={values?.cardTypeId ?? ''} required>
            <option value="" disabled>Choose…</option>
            {cardTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-location">Location</label>
          <select id="c-location" name="locationId" className="input" defaultValue={values?.locationId ?? ''}>
            <option value="">Unassigned</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c-status">Status *</label>
          <select id="c-status" name="status" className="input" defaultValue={values?.status ?? 'IN_STOCK'} required>
            {CARD_STATUSES.map((s) => (
              <option key={s} value={s}>{CARD_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-client">Client</label>
          <select id="c-client" name="clientId" className="input" defaultValue={values?.clientId ?? ''}>
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c-holder">Cardholder</label>
          <select id="c-holder" name="cardholderId" className="input" defaultValue={values?.cardholderId ?? ''}>
            <option value="">None</option>
            {cardholders.map((h) => (
              <option key={h.id} value={h.id}>{h.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="c-proxy">Proxy / reference</label>
          <input id="c-proxy" name="proxy" className="input" defaultValue={values?.proxy ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="c-pan">Card number</label>
          <input
            id="c-pan"
            name="pan"
            className="input"
            placeholder={values?.maskedPan ? `•••• ${values.maskedPan}` : ''}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-slate-500">Only the last 4 digits are stored.</p>
        </div>
        <div>
          <label className="label" htmlFor="c-batch">Batch / shipment</label>
          <input id="c-batch" name="batchRef" className="input" defaultValue={values?.batchRef ?? ''} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-issuedto">Issued to</label>
          <input id="c-issuedto" name="issuedTo" className="input" defaultValue={values?.issuedTo ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="c-expiry">Expiry date</label>
          <input id="c-expiry" name="expiryDate" type="date" className="input" defaultValue={asDateInput(values?.expiryDate)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-issuedat">Issue date</label>
          <input id="c-issuedat" name="issuedAt" type="date" className="input" defaultValue={asDateInput(values?.issuedAt)} />
        </div>
        <div>
          <label className="label" htmlFor="c-registered">Registration date</label>
          <input id="c-registered" name="registeredAt" type="date" className="input" defaultValue={asDateInput(values?.registeredAt)} />
          <p className="mt-1 text-xs text-slate-500">A registered card is live and no longer available stock.</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="c-notes">Notes</label>
        <textarea id="c-notes" name="notes" className="input" rows={2} defaultValue={values?.notes ?? ''} />
      </div>

      <div className="flex items-end gap-3">
        <div className="w-48">
          <label className="label" htmlFor="c-actor">Recorded by</label>
          <input id="c-actor" name="actor" className="input" defaultValue="HQ" />
        </div>
        <Submit label={submitLabel} />
      </div>
    </form>
  );
}
