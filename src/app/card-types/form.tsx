'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createCardType, type ActionState } from './actions';
import { Alert } from '@/components/ui';

type Issuer = { id: string; name: string; code: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Saving…' : 'Add card type'}
    </button>
  );
}

export function CardTypeForm({ issuers }: { issuers: Issuer[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createCardType, {});

  return (
    <form action={action} className="space-y-3 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="good">{state.success}</Alert>}
      <div>
        <label className="label" htmlFor="ct-code">Code</label>
        <input id="ct-code" name="code" className="input" placeholder="USD-RELOAD" required />
      </div>
      <div>
        <label className="label" htmlFor="ct-name">Name</label>
        <input id="ct-name" name="name" className="input" placeholder="USD Reloadable Card" required />
      </div>
      <div>
        <label className="label" htmlFor="ct-issuer">Issuer</label>
        <select id="ct-issuer" name="issuerId" className="input" defaultValue="" required>
          <option value="" disabled>Choose…</option>
          {issuers.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="ct-bin">BIN</label>
        <input id="ct-bin" name="bin" className="input" placeholder="541050" />
      </div>
      <div>
        <label className="label" htmlFor="ct-currency">Currency</label>
        <input id="ct-currency" name="currency" className="input" defaultValue="USD" maxLength={3} />
      </div>
      <div>
        <label className="label" htmlFor="ct-description">Description</label>
        <textarea id="ct-description" name="description" className="input" rows={2} />
      </div>
      <Submit />
    </form>
  );
}
