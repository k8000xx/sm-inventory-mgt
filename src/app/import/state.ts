import type { SheetPreview } from '@/lib/excel';
import type { ColumnMapping } from '@/lib/mapping';
import type { ImportResult } from '@/lib/import';

export type SheetInfo = SheetPreview & { suggestion: ColumnMapping };

export type ImportState = {
  stage: 'idle' | 'analyzed' | 'previewed' | 'committed';
  error?: string;
  notice?: string;
  filename?: string;
  activeSheet?: string;
  sheets?: SheetInfo[];
  result?: ImportResult;
};

// A "use server" module may only export async functions, so the initial state
// lives here rather than alongside the action.
export const INITIAL_IMPORT_STATE: ImportState = { stage: 'idle' };
