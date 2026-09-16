'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Alert, Panel } from '@/components/ui';
import { IMPORT_FIELDS, type ColumnMapping } from '@/lib/mapping';
import { importStep } from './actions';
import { INITIAL_IMPORT_STATE, type ImportState } from './state';

type Option = { id: string; name: string; code?: string };

function StepButton({
  label,
  onClick,
  pending,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onClick: () => void;
  pending: boolean;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={variant === 'primary' ? 'btn-primary' : 'btn-secondary'}
      disabled={pending || disabled}
    >
      {pending ? 'Working…' : label}
    </button>
  );
}

export function ImportWizard({
  locations,
  cardTypes,
  clients,
  issuers,
  savedMappings,
}: {
  locations: Option[];
  cardTypes: Option[];
  clients: Option[];
  issuers: Option[];
  savedMappings: { id: string; name: string; mappingJson: string }[];
}) {
  const [state, setState] = useState<ImportState>(INITIAL_IMPORT_STATE);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // React resets uncontrolled inputs once a form action completes, which would
  // drop the chosen file between the analyse, preview and commit steps. Holding
  // the File here and posting it explicitly keeps all three steps working from
  // one upload.
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [headerRow, setHeaderRow] = useState('');
  // Identifies the sheet shape the current mapping was seeded from.
  const seededFor = useRef('');

  const sheets = state.sheets ?? [];
  const activeSheet = useMemo(
    () => sheets.find((s) => s.name === (sheetName || state.activeSheet)) ?? sheets[0],
    [sheets, sheetName, state.activeSheet],
  );

  // Seed the mapping from the server's suggestion whenever the shape of the
  // sheet changes — a different sheet, or a corrected header row means entirely
  // different columns. Within one shape, the user's own edits are left alone.
  useEffect(() => {
    if (!activeSheet) return;
    const shape = `${activeSheet.name}:${activeSheet.headerRow}`;
    if (seededFor.current === shape) return;
    seededFor.current = shape;
    setMapping(activeSheet.suggestion);
  }, [activeSheet]);

  useEffect(() => {
    if (state.activeSheet && !sheetName) setSheetName(state.activeSheet);
  }, [state.activeSheet, sheetName]);

  useEffect(() => {
    if (activeSheet && !headerRow) setHeaderRow(String(activeSheet.headerRow));
  }, [activeSheet, headerRow]);

  const run = (intent: 'analyze' | 'dryrun' | 'commit') => {
    if (!file) {
      setState({ stage: 'idle', error: 'Choose a spreadsheet to upload.' });
      return;
    }
    const form = formRef.current;
    const data = form ? new FormData(form) : new FormData();
    data.set('file', file);
    data.set('intent', intent);
    data.set('mapping', JSON.stringify(mapping));

    startTransition(async () => {
      const next = await importStep(state, data);
      setState(next);
    });
  };

  const setField = (field: string, value: string) => {
    setMapping((prev) => {
      const next: ColumnMapping = { ...prev };
      if (value === '') delete next[field as keyof ColumnMapping];
      else next[field as keyof ColumnMapping] = Number(value);
      return next;
    });
  };

  const serialMapped = mapping.serial !== undefined;
  const result = state.result;
  const hasErrors = (result?.issues ?? []).some((i) => i.level === 'error');

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="grid gap-4">
      {state.error && <Alert tone="danger" title="Import stopped">{state.error}</Alert>}
      {state.notice && <Alert tone="good" title="Import committed">{state.notice}</Alert>}

      {/* ---- Step 1: the file ---- */}
      <Panel title="1 · Choose the spreadsheet">
        <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="imp-file">Excel file (.xlsx or .xlsm, up to 20 MB)</label>
            <input
              id="imp-file"
              type="file"
              name="file"
              accept=".xlsx,.xlsm"
              className="input file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1 file:text-sm file:text-white"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                seededFor.current = '';
                setSheetName('');
                setHeaderRow('');
                setState(INITIAL_IMPORT_STATE);
              }}
            />
            {file && (
              <p className="mt-1 text-xs text-slate-500">
                Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>
          <StepButton label="Read columns" variant="secondary" pending={pending} onClick={() => run('analyze')} />
        </div>
      </Panel>

      {/* ---- Step 2: mapping ---- */}
      {sheets.length > 0 && activeSheet && (
        <>
          <Panel title="2 · Match your columns to the app's fields">
            <div className="space-y-4 p-4">
              {sheets.length > 1 && (
                <div className="max-w-sm">
                  <label className="label" htmlFor="imp-sheet">Sheet</label>
                  <select
                    id="imp-sheet"
                    name="sheetName"
                    className="input"
                    value={sheetName || activeSheet.name}
                    onChange={(e) => {
                      setSheetName(e.target.value);
                      seededFor.current = '';
                      setHeaderRow('');
                    }}
                  >
                    {sheets.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name} ({s.rowCount} rows)
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Switching sheet? Press &ldquo;Read columns&rdquo; again to re-detect its headers.
                  </p>
                </div>
              )}
              {sheets.length === 1 && <input type="hidden" name="sheetName" value={activeSheet.name} />}

              <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="w-40">
                  <label className="label" htmlFor="imp-headerrow">Headings are on row</label>
                  <input
                    id="imp-headerrow"
                    name="headerRow"
                    type="number"
                    min={1}
                    className="input"
                    value={headerRow}
                    onChange={(e) => setHeaderRow(e.target.value)}
                  />
                </div>
                <StepButton
                  label="Re-read with this row"
                  variant="secondary"
                  pending={pending}
                  onClick={() => {
                    seededFor.current = '';
                    run('analyze');
                  }}
                />
                <p className="flex-1 text-xs text-slate-500">
                  Detected row {activeSheet.headerRow}. If the columns below are titles or blanks rather than headings,
                  correct the row number and re-read.
                </p>
              </div>

              {activeSheet.precisionWarnings.length > 0 && (
                <Alert tone="warn" title="Long numbers may have lost digits">
                  Excel stores long numbers imprecisely. These columns are affected:{' '}
                  <strong>{activeSheet.precisionWarnings.join(', ')}</strong>. Format them as Text in Excel and
                  re-save, otherwise serials can arrive corrupted.
                </Alert>
              )}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {IMPORT_FIELDS.map((field) => {
                  const value = mapping[field.key];
                  return (
                    <div key={field.key}>
                      <label className="label" htmlFor={`map-${field.key}`}>
                        {field.label} {field.required && <span className="text-red-600">*</span>}
                      </label>
                      <select
                        id={`map-${field.key}`}
                        className="input"
                        value={value === undefined ? '' : String(value)}
                        onChange={(e) => setField(field.key, e.target.value)}
                      >
                        <option value="">— not in file —</option>
                        {activeSheet.headers.map((h, i) => (
                          <option key={`${h}-${i}`} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                      {field.hint && <p className="mt-1 text-xs text-slate-500">{field.hint}</p>}
                    </div>
                  );
                })}
              </div>

              <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />

              {!serialMapped && (
                <Alert tone="danger">
                  Point the <strong>Card serial</strong> field at a column before continuing — it is how rows are
                  matched to cards already in the system.
                </Alert>
              )}

              {savedMappings.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xs font-medium text-slate-500">Load a saved mapping:</span>
                  {savedMappings.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="btn-secondary py-1 text-xs"
                      onClick={() => {
                        try {
                          setMapping(JSON.parse(m.mappingJson) as ColumnMapping);
                        } catch {
                          /* a corrupt saved mapping should not break the page */
                        }
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Column preview">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    {activeSheet.headers.map((h, i) => {
                      const mappedTo = IMPORT_FIELDS.find((f) => mapping[f.key] === i);
                      return (
                        <th key={`${h}-${i}`} className="th">
                          <div>{h}</div>
                          <div className={`mt-0.5 text-[10px] font-medium normal-case ${mappedTo ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {mappedTo ? `→ ${mappedTo.label}` : 'unmapped'}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {activeSheet.sampleRows.map((row, ri) => (
                    <tr key={ri} className="row-hover">
                      {activeSheet.headers.map((_, ci) => (
                        <td key={ci} className="td max-w-[220px] truncate text-slate-600">
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              Showing {activeSheet.sampleRows.length} of {activeSheet.rowCount} data rows.
            </div>
          </Panel>

          {/* ---- Step 3: options ---- */}
          <Panel title="3 · How should this file be applied?">
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="label" htmlFor="imp-mode">Import mode</label>
                <select id="imp-mode" name="mode" className="input" defaultValue="UPSERT">
                  <option value="UPSERT">Add new cards and update existing ones</option>
                  <option value="CREATE_ONLY">Only add cards that are new</option>
                  <option value="UPDATE_ONLY">Only update cards already in the system</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="imp-asof">Report is as of</label>
                <input id="imp-asof" name="asOfDate" type="date" className="input" defaultValue={today} />
                <p className="mt-1 text-xs text-slate-500">
                  The date the vessel or office reported, not the date you uploaded it. Movements are dated from this.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="imp-dateorder">Dates in the file read as</label>
                <select id="imp-dateorder" name="dateOrder" className="input" defaultValue="dmy">
                  <option value="dmy">Day / Month / Year (03/04/2026 = 3 April)</option>
                  <option value="mdy">Month / Day / Year (03/04/2026 = 4 March)</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="imp-defloc">Default location</label>
                <select id="imp-defloc" name="defaultLocationId" className="input" defaultValue="">
                  <option value="">— none —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}{l.code ? ` (${l.code})` : ''}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Used for rows with no location column or a blank cell.</p>
              </div>

              <div>
                <label className="label" htmlFor="imp-deftype">Default card type</label>
                <select id="imp-deftype" name="defaultCardTypeId" className="input" defaultValue="">
                  <option value="">— none —</option>
                  {cardTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Required if the file has no card-type column.</p>
              </div>

              <div>
                <label className="label" htmlFor="imp-defclient">Default client</label>
                <select id="imp-defclient" name="defaultClientId" className="input" defaultValue="">
                  <option value="">— none —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Used for rows with no client column. Cards are owned by a client.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="imp-defissuer">Issuer for new card types</label>
                <select id="imp-defissuer" name="defaultIssuerId" className="input" defaultValue="">
                  <option value="">— none —</option>
                  {issuers.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Required only if you let the import create card types below.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="imp-actor">Imported by</label>
                <input id="imp-actor" name="actor" className="input" defaultValue="HQ" />
              </div>

              <div className="md:col-span-2 xl:col-span-3">
                <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="createMissingLocations" className="mt-0.5 h-4 w-4" />
                    <span>
                      Create locations found in the file
                      <span className="block text-xs text-slate-500">
                        Created as Office type with a code derived from the name — review them afterwards. Leave this
                        off and rows naming an unknown location are rejected instead.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="createMissingCardTypes" className="mt-0.5 h-4 w-4" />
                    <span>
                      Create card types found in the file
                      <span className="block text-xs text-slate-500">Otherwise rows with unknown types are rejected.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="markVerified" className="mt-0.5 h-4 w-4" defaultChecked />
                    <span>
                      Treat this file as physical confirmation
                      <span className="block text-xs text-slate-500">
                        Stamps each card as verified on the &ldquo;as of&rdquo; date. Untick for issuer extracts nobody
                        physically checked.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 px-4 py-3">
              <StepButton
                label="Preview changes"
                variant="secondary"
                pending={pending}
                disabled={!serialMapped}
                onClick={() => run('dryrun')}
              />
              <div className="w-56">
                <label className="label" htmlFor="imp-savemap">Save this mapping as</label>
                <input id="imp-savemap" name="saveMappingAs" className="input" placeholder="Monthly vessel report" />
              </div>
            </div>
          </Panel>
        </>
      )}

      {/* ---- Step 4: dry-run result ---- */}
      {result && (
        <Panel title={state.stage === 'committed' ? 'Import result' : '4 · Preview — nothing has been saved yet'}>
          <div className="grid gap-4 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              {[
                ['Rows', result.summary.total, 'text-slate-900'],
                ['New cards', result.summary.created, 'text-emerald-700'],
                ['Updated', result.summary.updated, 'text-sky-700'],
                ['Unchanged', result.summary.unchanged, 'text-slate-500'],
                ['Skipped', result.summary.skipped, 'text-amber-700'],
                ['Errors', result.summary.errored, result.summary.errored > 0 ? 'text-red-700' : 'text-slate-500'],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                  <div className={`text-xl font-semibold tabular-nums ${tone}`}>{String(value)}</div>
                </div>
              ))}
            </div>

            {(result.newLocations.length > 0 || result.newCardTypes.length > 0) && (
              <Alert tone="info" title="Will be created from this file">
                {result.newLocations.length > 0 && <div>Locations: {result.newLocations.join(', ')}</div>}
                {result.newCardTypes.length > 0 && <div>Card types: {result.newCardTypes.join(', ')}</div>}
              </Alert>
            )}

            {result.issues.length > 0 && (
              <div className="rounded-md border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {result.issues.length} issue(s)
                </div>
                <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
                  {result.issues.slice(0, 200).map((issue, i) => (
                    <li key={i} className="flex gap-3 px-3 py-1.5 text-sm">
                      <span className={`w-16 shrink-0 text-xs font-semibold ${issue.level === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                        {issue.level === 'error' ? 'ERROR' : 'WARN'}
                      </span>
                      <span className="w-16 shrink-0 text-xs text-slate-400">row {issue.row}</span>
                      <span className="font-mono text-xs text-slate-500">{issue.serial}</span>
                      <span className="text-slate-700">{issue.message}</span>
                    </li>
                  ))}
                </ul>
                {result.issues.length > 200 && (
                  <div className="px-3 py-1.5 text-xs text-slate-500">+{result.issues.length - 200} more not shown.</div>
                )}
              </div>
            )}

            <div className="rounded-md border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Row-by-row
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full">
                  <tbody>
                    {result.rows.slice(0, 300).map((row) => (
                      <tr key={row.row} className="row-hover">
                        <td className="td w-16 text-xs text-slate-400">{row.row}</td>
                        <td className="td font-mono text-xs">{row.serial || '—'}</td>
                        <td className="td w-28">
                          <span
                            className={`text-xs font-semibold ${
                              row.action === 'create'
                                ? 'text-emerald-700'
                                : row.action === 'update'
                                  ? 'text-sky-700'
                                  : row.action === 'skip'
                                    ? 'text-amber-700'
                                    : 'text-slate-400'
                            }`}
                          >
                            {row.action}
                          </span>
                        </td>
                        <td className="td text-slate-500">{row.reason ?? row.changes.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.rows.length > 300 && (
                <div className="px-3 py-1.5 text-xs text-slate-500">+{result.rows.length - 300} more rows not shown.</div>
              )}
            </div>

            {state.stage === 'previewed' && (
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
                <StepButton
                  label={`Commit ${result.summary.created + result.summary.updated} change(s)`}
                  pending={pending}
                  onClick={() => run('commit')}
                />
                {hasErrors && (
                  <span className="text-sm text-amber-700">
                    Rows with errors will be left out; everything else still imports.
                  </span>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}
    </form>
  );
}
