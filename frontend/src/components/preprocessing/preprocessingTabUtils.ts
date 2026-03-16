import { Columns3, Eraser, ScalingIcon, Hash, FilterX, Code, Wrench, type LucideIcon } from 'lucide-react';
import type { ReplayCompatibilityReport } from '@/stores/preprocessingStore';
import type { StepCellBinding, TransformationEvent } from '@/types/preprocessing';

export const DEFAULT_WORKBOOK_ID = 'processing-tab-1';
/** @deprecated Use DEFAULT_WORKBOOK_ID */
export const DEFAULT_TAB_ID = DEFAULT_WORKBOOK_ID;

export interface PreprocessingTabSnapshot {
  selectedDatasetId: string | null;
  runId: string | null;
  timeline: TransformationEvent[];
  stepBindings: Record<string, StepCellBinding>;
  replayReport: ReplayCompatibilityReport | null;
}

/** A preprocessing workbook (chat+notebook pair). */
export interface PreprocessingWorkbook {
  id: string;
  name: string;
  notebookId: string | null;
  snapshot: PreprocessingTabSnapshot;
  storageVersion: number;
}

/** @deprecated Use PreprocessingWorkbook */
export type PreprocessingTab = PreprocessingWorkbook;

export function createEmptyTabSnapshot(): PreprocessingTabSnapshot {
  return {
    selectedDatasetId: null,
    runId: null,
    timeline: [],
    stepBindings: {},
    replayReport: null
  };
}

export function createWorkbookId(): string {
  return `proc-${Math.random().toString(36).slice(2, 10)}`;
}
/** @deprecated Use createWorkbookId */
export const createTabId = createWorkbookId;

export function createDefaultWorkbook(): PreprocessingWorkbook {
  return {
    id: DEFAULT_WORKBOOK_ID,
    name: 'Workbook 1',
    notebookId: null,
    snapshot: createEmptyTabSnapshot(),
    storageVersion: 0
  };
}
/** @deprecated Use createDefaultWorkbook */
export const createDefaultTab = createDefaultWorkbook;

export function parseWorkbookIndex(name: string): number | null {
  // Accept both "Processing N" (legacy) and "Workbook N"
  const match = /^(?:Processing|Workbook)\s+(\d+)$/i.exec(name.trim());
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}
/** @deprecated Use parseWorkbookIndex */
export const parseProcessingIndex = parseWorkbookIndex;

export function nextWorkbookName(workbooks: PreprocessingWorkbook[]): string {
  const used = new Set<number>();
  workbooks.forEach((wb) => {
    const index = parseWorkbookIndex(wb.name);
    if (index) {
      used.add(index);
    }
  });
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return `Workbook ${candidate}`;
}
/** @deprecated Use nextWorkbookName */
export const nextProcessingTabName = nextWorkbookName;

export function normalizeWorkbookNames(workbooks: PreprocessingWorkbook[]): PreprocessingWorkbook[] {
  const used = new Set<number>();
  return workbooks.map((wb) => {
    const parsed = parseWorkbookIndex(wb.name);
    if (!parsed || !used.has(parsed)) {
      if (parsed) {
        used.add(parsed);
      }
      return wb;
    }
    let candidate = 1;
    while (used.has(candidate)) {
      candidate += 1;
    }
    used.add(candidate);
    return {
      ...wb,
      name: `Workbook ${candidate}`
    };
  });
}
/** @deprecated Use normalizeWorkbookNames */
export const normalizeProcessingTabNames = normalizeWorkbookNames;

export function statusClassName(status: TransformationEvent['status'], divergedClassName: string): string {
  if (status === 'applied') return 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400';
  if (status === 'failed') return 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400';
  if (status === 'awaiting_approval') return 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400';
  if (status === 'diverged') return divergedClassName;
  if (status === 'running') return 'border-sky-300 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400';
  return 'border-muted bg-muted/50 text-muted-foreground';
}

export const STATUS_LABELS: Record<TransformationEvent['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  awaiting_approval: 'Awaiting approval',
  applied: 'Applied',
  failed: 'Failed',
  diverged: 'Diverged'
};

export const STATUS_DOT_COLOR: Record<TransformationEvent['status'], string> = {
  applied: 'bg-emerald-500',
  failed: 'bg-red-500',
  awaiting_approval: 'bg-amber-500',
  running: 'bg-sky-500',
  diverged: 'bg-violet-500',
  pending: 'bg-muted-foreground/40'
};

export function stepTypeIcon(intentType?: string): LucideIcon {
  switch (intentType) {
    case 'drop_columns': return Columns3;
    case 'impute_missing': return Eraser;
    case 'scale_features': return ScalingIcon;
    case 'encode_categorical': return Hash;
    case 'remove_outliers': return FilterX;
    case 'custom_python': return Code;
    default: return Wrench;
  }
}

const ROW_COUNT_FORMATTER = new Intl.NumberFormat('en-US');

export function getRowCountSummary(event: TransformationEvent): {
  before: string;
  after: string;
  schemaDrift: boolean;
} | null {
  const validation = event.validation;
  if (!validation) {
    return null;
  }
  if (typeof validation.rowCountBefore !== 'number' || typeof validation.rowCountAfter !== 'number') {
    return null;
  }
  return {
    before: ROW_COUNT_FORMATTER.format(validation.rowCountBefore),
    after: ROW_COUNT_FORMATTER.format(validation.rowCountAfter),
    schemaDrift: Boolean(validation.schemaDrift)
  };
}

export function summarizeValidation(event: TransformationEvent): string | null {
  if (!event.validation) {
    return null;
  }
  const { schemaDrift, notes } = event.validation;
  if (typeof notes === 'string' && notes.trim()) {
    return notes;
  }
  if (schemaDrift) {
    return 'Schema drift flagged.';
  }
  return null;
}
