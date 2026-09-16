'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import type { ActionState } from './actions';

export type ClientFormValues = {
  code?: string;
  name?: string;
  registeredNo?: string | null;
  country?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
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

export function ClientForm({
  action,
  values,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  values?: ClientFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="good">{state.success}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cl-code">Code</label>
          <input id="cl-code" name="code" className="input" defaultValue={values?.code} placeholder="OCEANIC" required />
        </div>
        <div>
          <label className="label" htmlFor="cl-country">Country</label>
          <input id="cl-country" name="country" className="input" defaultValue={values?.country ?? ''} placeholder="Singapore" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="cl-name">Name</label>
        <input id="cl-name" name="name" className="input" defaultValue={values?.name} placeholder="Oceanic Shipping Ltd" required />
      </div>

      <div>
        <label className="label" htmlFor="cl-reg">Registration number</label>
        <input id="cl-reg" name="registeredNo" className="input" defaultValue={values?.registeredNo ?? ''} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cl-contact">Contact name</label>
          <input id="cl-contact" name="contactName" className="input" defaultValue={values?.contactName ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="cl-phone">Contact phone</label>
          <input id="cl-phone" name="contactPhone" className="input" defaultValue={values?.contactPhone ?? ''} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="cl-email">Contact email</label>
        <input id="cl-email" name="contactEmail" type="email" className="input" defaultValue={values?.contactEmail ?? ''} />
      </div>

      <div>
        <label className="label" htmlFor="cl-notes">Notes</label>
        <textarea id="cl-notes" name="notes" className="input" rows={2} defaultValue={values?.notes ?? ''} />
      </div>

      <Submit label={submitLabel} />
    </form>
  );
}
