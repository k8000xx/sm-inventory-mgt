'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { createRegistration, type ActionState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Registering…' : 'Register these cards'}
    </button>
  );
}

export function RegistrationForm() {
  const [state, action] = useActionState<ActionState, FormData>(createRegistration, {});
  const [source, setSource] = useState<'paste' | 'file'>('paste');
  const [pasted, setPasted] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  const lineCount = pasted.split(/\r?\n/).filter((l) => l.trim()).length;

  return (
    <form action={action} className="grid gap-4 p-4">
      {state.error && (
        <Alert tone="danger">
          {state.error}
          <span className="block text-xs">If you had chosen a file, select it again before resubmitting.</span>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="rg-date">Registered on *</label>
          <input id="rg-date" name="registeredOn" type="date" className="input" defaultValue={today} required />
          <p className="mt-1 text-xs text-slate-500">The date the issuer reported, not today.</p>
        </div>
        <div>
          <label className="label" htmlFor="rg-by">Recorded by *</label>
          <input id="rg-by" name="recordedBy" className="input" defaultValue="HQ" required />
        </div>
        <div>
          <label className="label" htmlFor="rg-ref">Reference</label>
          <input id="rg-ref" name="reference" className="input" placeholder="Auto-generated if blank" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex gap-2">
          <button type="button" className={source === 'paste' ? 'btn-primary' : 'btn-secondary'} onClick={() => setSource('paste')}>
            Paste serials
          </button>
          <button type="button" className={source === 'file' ? 'btn-primary' : 'btn-secondary'} onClick={() => setSource('file')}>
            Upload a sheet
          </button>
        </div>

        <div className={source === 'paste' ? '' : 'hidden'}>
          <label className="label" htmlFor="rg-serials">Registered card serials</label>
          <textarea
            id="rg-serials"
            name="serials"
            className="input font-mono"
            rows={12}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'One card per line. A crew reference after the serial links the cardholder.\n\n54105000001001\n54105000001002  CRW-04821\n54105000001003, CRW-04822'}
          />
          <p className="mt-1 text-xs text-slate-500">
            {lineCount > 0 ? `${lineCount} line(s) entered. ` : ''}
            Anything after the serial is read as the cardholder&rsquo;s crew or employee reference.
          </p>
        </div>

        <div className={source === 'file' ? 'grid gap-3 sm:grid-cols-2' : 'hidden'}>
          <div>
            <label className="label" htmlFor="rg-file">Registration report (.xlsx)</label>
            <input
              id="rg-file"
              type="file"
              name="file"
              accept=".xlsx,.xlsm"
              className="input file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1 file:text-sm file:text-white"
            />
          </div>
          <div>
            <label className="label" htmlFor="rg-header">Serial column heading</label>
            <input id="rg-header" name="serialHeader" className="input" placeholder="Auto-detected if left blank" />
            <p className="mt-1 text-xs text-slate-500">A cardholder reference column is picked up automatically if present.</p>
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="rg-notes">Notes</label>
        <textarea id="rg-notes" name="notes" className="input" rows={2} placeholder="Where this report came from." />
      </div>

      <div><Submit /></div>
    </form>
  );
}
