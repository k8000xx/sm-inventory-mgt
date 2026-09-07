'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { createStockCount, type ActionState } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Comparing…' : 'Record count and show variances'}
    </button>
  );
}

export function StockCountForm({
  locations,
  defaultLocationId,
}: {
  locations: { id: string; name: string; code: string }[];
  defaultLocationId?: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(createStockCount, {});
  const [source, setSource] = useState<'paste' | 'file'>('paste');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="grid gap-4 p-4">
      {state.error && (
        <Alert tone="danger">
          {state.error}
          {' '}
          <span className="block text-xs">If you had chosen a file, select it again before resubmitting.</span>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sc-location">Location counted *</label>
          <select id="sc-location" name="locationId" className="input" defaultValue={defaultLocationId ?? ''} required>
            <option value="" disabled>Choose…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sc-date">Date counted *</label>
          <input id="sc-date" name="countDate" type="date" className="input" defaultValue={today} required />
          <p className="mt-1 text-xs text-slate-500">The date the physical check happened, not today's date.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sc-by">Counted by *</label>
          <input id="sc-by" name="countedBy" className="input" placeholder="Chief Officer, MV Aurora" required />
        </div>
        <div>
          <label className="label" htmlFor="sc-ref">Reference</label>
          <input id="sc-ref" name="reference" className="input" placeholder="Auto-generated if left blank" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            className={source === 'paste' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setSource('paste')}
          >
            Paste serials
          </button>
          <button
            type="button"
            className={source === 'file' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setSource('file')}
          >
            Upload a sheet
          </button>
        </div>

        <div className={source === 'paste' ? '' : 'hidden'}>
          <label className="label" htmlFor="sc-serials">Serials physically found</label>
          <textarea
            id="sc-serials"
            name="serials"
            className="input font-mono"
            rows={10}
            placeholder={'One per line, or separated by commas.\n\n5412345678901234\n5412345678901235'}
          />
          <p className="mt-1 text-xs text-slate-500">
            List every card actually seen. Anything the system expects here but you do not list will show up as missing.
          </p>
        </div>

        <div className={source === 'file' ? 'grid gap-3 sm:grid-cols-2' : 'hidden'}>
          <div>
            <label className="label" htmlFor="sc-file">Count sheet (.xlsx)</label>
            <input
              id="sc-file"
              type="file"
              name="file"
              accept=".xlsx,.xlsm"
              className="input file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1 file:text-sm file:text-white"
            />
          </div>
          <div>
            <label className="label" htmlFor="sc-header">Serial column heading</label>
            <input id="sc-header" name="serialHeader" className="input" placeholder="Auto-detected if left blank" />
            <p className="mt-1 text-xs text-slate-500">Type the exact heading if auto-detection picks the wrong column.</p>
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="sc-notes">Notes</label>
        <textarea id="sc-notes" name="notes" className="input" rows={2} placeholder="Anything worth recording about how the count was done." />
      </div>

      <div>
        <Submit />
      </div>
    </form>
  );
}
