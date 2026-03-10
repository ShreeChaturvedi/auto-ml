import type { ReplayCompatibilityReport } from '@/stores/preprocessingStore';
import type { StepCellBinding, TransformationEvent } from '@/types/preprocessing';

export const DEFAULT_TAB_ID = 'processing-tab-1';

export interface PreprocessingTabSnapshot {
  selectedDatasetId: string | null;
  runId: string | null;
  timeline: TransformationEvent[];
  stepBindings: Record<string, StepCellBinding>;
  replayReport: ReplayCompatibilityReport | null;
}

export interface PreprocessingTab {
  id: string;
  name: string;
  notebookId: string | null;
  snapshot: PreprocessingTabSnapshot;
  storageVersion: number;
}

export function createEmptyTabSnapshot(): PreprocessingTabSnapshot {
  return {
    selectedDatasetId: null,
    runId: null,
    timeline: [],
    stepBindings: {},
    replayReport: null
  };
}

export function createTabId(): string {
  return `proc-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultTab(): PreprocessingTab {
  return {
    id: DEFAULT_TAB_ID,
    name: 'Processing 1',
    notebookId: null,
    snapshot: createEmptyTabSnapshot(),
    storageVersion: 0
  };
}

export function parseProcessingIndex(name: string): number | null {
  const match = /^Processing\s+(\d+)$/i.exec(name.trim());
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function nextProcessingTabName(tabs: PreprocessingTab[]): string {
  const used = new Set<number>();
  tabs.forEach((tab) => {
    const index = parseProcessingIndex(tab.name);
    if (index) {
      used.add(index);
    }
  });
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return `Processing ${candidate}`;
}

export function normalizeProcessingTabNames(tabs: PreprocessingTab[]): PreprocessingTab[] {
  const used = new Set<number>();
  return tabs.map((tab) => {
    const parsed = parseProcessingIndex(tab.name);
    if (!parsed || !used.has(parsed)) {
      if (parsed) {
        used.add(parsed);
      }
      return tab;
    }
    let candidate = 1;
    while (used.has(candidate)) {
      candidate += 1;
    }
    used.add(candidate);
    return {
      ...tab,
      name: `Processing ${candidate}`
    };
  });
}

export function statusClassName(status: TransformationEvent['status'], divergedClassName: string): string {
  if (status === 'applied') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-red-300 bg-red-50 text-red-700';
  if (status === 'awaiting_approval') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (status === 'diverged') return divergedClassName;
  if (status === 'running') return 'border-sky-300 bg-sky-50 text-sky-700';
  return 'border-muted bg-muted/50 text-muted-foreground';
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
