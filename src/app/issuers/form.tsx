'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { createIssuer, type ActionState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Saving…' : 'Add issuer'}
    </button>
  );
}

export function IssuerForm() {
  const [state, action] = useActionState<ActionState, FormData>(createIssuer, {});

  return (
    <form action={action} className="space-y-3 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="good">{state.success}</Alert>}
      <div>
        <label className="label" htmlFor="is-code">Code</label>
        <input id="is-code" name="code" className="input" placeholder="MONAVATE" required />
      </div>
      <div>
        <label className="label" htmlFor="is-name">Name</label>
        <input id="is-name" name="name" className="input" placeholder="Monavate" required />
      </div>
      <div>
        <label className="label" htmlFor="is-contact">Contact name</label>
        <input id="is-contact" name="contactName" className="input" placeholder="Programme manager" />
      </div>
      <div>
        <label className="label" htmlFor="is-email">Contact email</label>
        <input id="is-email" name="contactEmail" type="email" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="is-desc">Description</label>
        <textarea id="is-desc" name="description" className="input" rows={2} />
      </div>
      <Submit />
    </form>
  );
}
