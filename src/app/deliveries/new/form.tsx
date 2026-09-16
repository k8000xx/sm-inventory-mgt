'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { createDelivery, type ActionState } from '../actions';

type Option = { id: string; name: string; code: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Building…' : 'Create delivery'}
    </button>
  );
}

export function DeliveryForm({
  locations,
  cardTypes,
}: {
  locations: Option[];
  cardTypes: Option[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(createDelivery, {});
  const [mode, setMode] = useState<'quantity' | 'serials'>('quantity');
  const [serials, setSerials] = useState('');

  return (
    <form action={action} className="grid gap-4 p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="dl-from">Ship from *</label>
          <select id="dl-from" name="fromLocationId" className="input" defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dl-to">Deliver to *</label>
          <select id="dl-to" name="toLocationId" className="input" defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="mb-2 flex gap-2">
          <button type="button" className={mode === 'quantity' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('quantity')}>
            By quantity
          </button>
          <button type="button" className={mode === 'serials' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('serials')}>
            By serial
          </button>
        </div>

        <div className={mode === 'quantity' ? 'grid gap-3 sm:grid-cols-2' : 'hidden'}>
          <div>
            <label className="label" htmlFor="dl-qty">How many cards</label>
            <input id="dl-qty" name="quantity" type="number" min={1} className="input" defaultValue={25} />
            <p className="mt-1 text-xs text-slate-500">
              Takes the lowest serials on hand at the source. If the destination belongs to a client, only that
              client&rsquo;s stock is taken.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="dl-type">Card type</label>
            <select id="dl-type" name="cardTypeId" className="input" defaultValue="">
              <option value="">Any product</option>
              {cardTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={mode === 'serials' ? '' : 'hidden'}>
          <label className="label" htmlFor="dl-serials">Serials to send</label>
          <textarea
            id="dl-serials"
            className="input font-mono"
            rows={8}
            value={serials}
            onChange={(e) => setSerials(e.target.value)}
            placeholder={'One per line.\n\n54105000001001\n54105000001002'}
          />
          <p className="mt-1 text-xs text-slate-500">
            Only serials on hand at the source location are put on the manifest.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="dl-ref">Reference</label>
          <input id="dl-ref" name="reference" className="input" placeholder="Auto-generated if blank" />
        </div>
        <div>
          <label className="label" htmlFor="dl-expected">Expected arrival</label>
          <input id="dl-expected" name="expectedAt" type="date" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="dl-carrier">Carrier</label>
          <input id="dl-carrier" name="carrier" className="input" placeholder="DHL / ship's agent" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="dl-track">Tracking reference</label>
          <input id="dl-track" name="trackingRef" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="dl-notes">Notes</label>
          <input id="dl-notes" name="notes" className="input" />
        </div>
      </div>

      {/* Serial mode posts one hidden field per line so the server resolves them. */}
      {mode === 'serials' &&
        serials
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s, i) => <input key={`${s}-${i}`} type="hidden" name="serialList" value={s} />)}

      <div><Submit /></div>
    </form>
  );
}
