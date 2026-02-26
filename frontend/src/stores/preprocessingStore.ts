import { create } from 'zustand';

import { listAvailableTables } from '@/lib/api/preprocessing';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { NotebookCell } from '@/types/notebook';
import type { AvailableTable, StepCellBinding, TransformationEvent, TransformationStatus } from '@/types/preprocessing';

const SEMANTIC_TOOL_NAMES = new Set([
  'propose_transformation_step',
  'materialize_step_code',
  'execute_transformation_step',
  'validate_step_result',
  'commit_transformation_step'
]);


const PHASE_STATUS_BY_TOOL: Record<string, TransformationStatus> = {
  propose_transformation_step: 'pending',
  materialize_step_code: 'running',
  execute_transformation_step: 'running',
  validate_step_result: 'running',
  commit_transformation_step: 'running'
};

function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return Math.abs(hash).toString(16);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function extractStepPayload(result: ToolResult): Record<string, unknown> | null {
  const output = asRecord(result.output);
  const step = asRecord(output.step);
  if (!Object.keys(step).length) {
    return null;
  }
  return {
    ...step,
    runId: asString(output.runId),
    status: asString(output.status) ?? asString(step.status)
  };
}

function getRunIdFromToolResult(result: ToolResult): string | undefined {
  return asString(asRecord(result.output).runId);
}

function isSemanticTool(name: string): boolean {
  return SEMANTIC_TOOL_NAMES.has(name);
}



function inferRiskyIntent(intentType: string | undefined): boolean {
  if (!intentType) {
    return false;
  }
  const lowered = intentType.toLowerCase();
  return lowered.includes('drop') || lowered.includes('outlier') || lowered.includes('custom');
}

export interface PreprocessingChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ReplayCompatibilityReport {
  checkedAt: number;
  compatible: boolean;
  issues: string[];
}

interface PreprocessingState {
  tables: AvailableTable[];
  selectedDatasetId: string | null;
  runId: string | null;
  assistantMessages: PreprocessingChatMessage[];
  timeline: TransformationEvent[];
  stepBindings: Record<string, StepCellBinding>;
  replayReport: ReplayCompatibilityReport | null;
  isLoadingTables: boolean;
  error: string | null;
      loadTables: (projectId: string) => Promise<void>;
  selectDataset: (datasetId: string) => void;
    approveStep: (stepId: string) => void;
  rejectStep: (stepId: string, reason?: string) => void;
  editStepCode: (stepId: string, code: string) => void;
  syncDivergence: (cells: NotebookCell[]) => void;
  evaluateReplayCompatibility: () => void;
  clearRun: () => void;
  processToolCall: (call: ToolCall, fallbackRunId?: string) => void;
  processToolResult: (call: ToolCall, result: ToolResult, fallbackRunId?: string) => void;

}



const initialState = {
  tables: [],
  selectedDatasetId: null,
  runId: null,
  assistantMessages: [],
  timeline: [],
  stepBindings: {},
  replayReport: null,
  isLoadingTables: false,
  error: null
};


function upsertTimelineEvent(timeline: TransformationEvent[], incoming: TransformationEvent): TransformationEvent[] {
  const existingIndex = timeline.findIndex((event) => event.stepId === incoming.stepId);
  if (existingIndex === -1) {
    return [...timeline, incoming].sort((a, b) => a.createdAt - b.createdAt);
  }

  const existing = timeline[existingIndex];
  const merged: TransformationEvent = {
    ...existing,
    ...incoming,
    cellIds: [...new Set([...existing.cellIds, ...incoming.cellIds])],
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt)
  };

  const next = [...timeline];
  next[existingIndex] = merged;
  return next;
}

function buildEventFromToolCall(call: ToolCall, runId: string | null): TransformationEvent | null {
  if (!isSemanticTool(call.tool)) {
    return null;
  }

  const args = asRecord(call.args);
  const stepId = asString(args.stepId) ?? `step-${call.id}`;
  const now = Date.now();
  return {
    id: `evt-${stepId}`,
    runId: asString(args.runId) ?? runId ?? 'pending-run',
    stepId,
    toolName: call.tool,
    title: asString(args.title) ?? asString(args.intentType) ?? 'Transformation step',
    status: PHASE_STATUS_BY_TOOL[call.tool] ?? 'running',
    rationale: asString(args.rationale),
    intentType: asString(args.intentType),
    code: asString(args.code),
    codeHash: asString(args.code) ? hashText(asString(args.code) ?? '') : undefined,
    version: asNumber(args.version),
    cellIds: asStringArray(args.cellIds),
    requiresApproval: asBoolean(args.requiresApproval) ?? inferRiskyIntent(asString(args.intentType)),
    createdAt: now,
    updatedAt: now
  };
}

function buildEventFromToolResult(call: ToolCall, result: ToolResult, fallbackRunId: string | null): TransformationEvent | null {
  if (!isSemanticTool(call.tool)) {
    return null;
  }

  const step = extractStepPayload(result);
  const args = asRecord(call.args);
  const now = Date.now();
  const stepId = asString(step?.stepId) ?? asString(args.stepId) ?? `step-${call.id}`;
  const validation = step?.validation ? asRecord(step.validation) : {};

  return {
    id: `evt-${stepId}`,
    runId: asString(step?.runId) ?? getRunIdFromToolResult(result) ?? asString(args.runId) ?? fallbackRunId ?? 'pending-run',
    stepId,
    toolName: call.tool,
    title: asString(step?.title) ?? asString(args.title) ?? asString(args.intentType) ?? 'Transformation step',
    status: result.error
      ? 'failed'
      : ((asString(step?.status) as TransformationStatus | undefined) ?? PHASE_STATUS_BY_TOOL[call.tool] ?? 'running'),
    rationale: asString(step?.rationale) ?? asString(args.rationale),
    intentType: asString(step?.intentType) ?? asString(args.intentType),
    code: asString(step?.code) ?? asString(args.code),
    codeHash: asString(step?.codeHash) ?? (asString(step?.code) ? hashText(asString(step?.code) ?? '') : undefined),
    version: asNumber(step?.version),
    cellIds: [
      ...new Set([
        ...asStringArray(step?.cellIds),
        ...asStringArray(args.cellIds),
        ...(asString(args.cellId) ? [asString(args.cellId) ?? ''] : [])
      ])
    ].filter(Boolean),
    validation: {
      rowCountBefore: asNumber(validation.rowCountBefore),
      rowCountAfter: asNumber(validation.rowCountAfter),
      nullCountBefore: asNumber(validation.nullCountBefore),
      nullCountAfter: asNumber(validation.nullCountAfter),
      schemaDrift: asBoolean(validation.schemaDrift),
      notes: asString(validation.notes)
    },
    requiresApproval: asBoolean(step?.requiresApproval) ?? asBoolean(args.requiresApproval) ?? false,
    output: result.output,
    error: result.error,
    createdAt: now,
    updatedAt: now
  };
}

function extractReferencedColumns(code: string): string[] {
  const matches = [...code.matchAll(/\[['"]([A-Za-z0-9_ -]+)['"]\]/g)];
  return [...new Set(matches.map((match) => match[1]).filter(Boolean))];
}

export const usePreprocessingStore = create<PreprocessingState>((set, get) => ({
  ...initialState,

  loadTables: async (projectId: string) => {
    set({ isLoadingTables: true, error: null });
    try {
      const { tables } = await listAvailableTables(projectId);
      set({ tables, isLoadingTables: false });
    } catch (error) {
      console.error('[preprocessingStore] Failed to load tables:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to load tables',
        isLoadingTables: false
      });
    }
  },

  selectDataset: (datasetId: string) => {
    set({
      selectedDatasetId: datasetId,
      runId: null,
      assistantMessages: [],
      timeline: [],
      stepBindings: {},
      replayReport: null,
      error: null
    });
  },

  approveStep: (stepId: string) => {
    set((state) => ({
      timeline: state.timeline.map((event) =>
        event.stepId === stepId
          ? {
              ...event,
              status: 'applied',
              requiresApproval: false,
              updatedAt: Date.now()
            }
          : event
      )
    }));
  },

  rejectStep: (stepId: string, reason?: string) => {
    set((state) => ({
      timeline: state.timeline.map((event) =>
        event.stepId === stepId
          ? {
              ...event,
              status: 'failed',
              error: reason ?? 'Rejected by user',
              updatedAt: Date.now()
            }
          : event
      )
    }));
  },

  editStepCode: (stepId: string, code: string) => {
    set((state) => ({
      timeline: state.timeline.map((event) =>
        event.stepId === stepId
          ? {
              ...event,
              code,
              codeHash: hashText(code),
              status: 'pending',
              updatedAt: Date.now()
            }
          : event
      ),
      stepBindings: {
        ...state.stepBindings,
        [stepId]: {
          ...(state.stepBindings[stepId] ?? {
            stepId,
            cellIds: [],
            lastSyncedAt: Date.now()
          }),
          codeHash: hashText(code),
          lastSyncedAt: Date.now()
        }
      }
    }));
  },

  syncDivergence: (cells: NotebookCell[]) => {
    if (!cells.length) {
      return;
    }

    const contentByCellId = new Map(cells.map((cell) => [cell.cellId, cell.content]));
    set((state) => ({
      timeline: state.timeline.map((event) => {
        const binding = state.stepBindings[event.stepId];
        if (!binding?.codeHash || binding.cellIds.length === 0) {
          return event;
        }

        const hasDiverged = binding.cellIds.some((cellId) => {
          const content = contentByCellId.get(cellId);
          return typeof content === 'string' && hashText(content) !== binding.codeHash;
        });

        if (hasDiverged && event.status !== 'diverged') {
          return {
            ...event,
            status: 'diverged',
            updatedAt: Date.now()
          };
        }

        if (!hasDiverged && event.status === 'diverged') {
          return {
            ...event,
            status: event.requiresApproval ? 'awaiting_approval' : 'applied',
            updatedAt: Date.now()
          };
        }

        return event;
      })
    }));
  },

  evaluateReplayCompatibility: () => {
    const state = get();
    const selectedTable = state.tables.find((table) => table.datasetId === state.selectedDatasetId);
    const availableColumns = new Set(selectedTable?.columns?.map((column) => column.name) ?? []);
    const issues: string[] = [];

    state.timeline.forEach((event) => {
      if (!event.code) {
        return;
      }
      const referencedColumns = extractReferencedColumns(event.code);
      const missingColumns = referencedColumns.filter((column) => !availableColumns.has(column));
      if (missingColumns.length > 0) {
        issues.push(`${event.title}: missing columns (${missingColumns.join(', ')})`);
      }
      if (event.validation?.schemaDrift) {
        issues.push(`${event.title}: schema drift detected in validation.`);
      }
    });

    set({
      replayReport: {
        checkedAt: Date.now(),
        compatible: issues.length === 0,
        issues
      }
    });
  },

  
  processToolCall: (call, fallbackRunId) => {
    const event = buildEventFromToolCall(call, fallbackRunId || null);
    if (!event) return;
    set(state => ({
      timeline: upsertTimelineEvent(state.timeline, event)
    }));
  },

  processToolResult: (call, result, fallbackRunId) => {
    const event = buildEventFromToolResult(call, result, fallbackRunId || null);
    if (!event) return;
    
    set(state => {
      let nextRunId = state.runId;
      const resultRunId = getRunIdFromToolResult(result);
      if (resultRunId) nextRunId = resultRunId;
      
      const timeline = upsertTimelineEvent(state.timeline, event);
      const bindings = { ...state.stepBindings };
      
      const previousBinding = bindings[event.stepId];
      bindings[event.stepId] = {
        stepId: event.stepId,
        cellIds: [...new Set([...(previousBinding?.cellIds ?? []), ...event.cellIds])],
        codeHash: event.codeHash ?? previousBinding?.codeHash,
        version: event.version ?? previousBinding?.version,
        lastSyncedAt: Date.now()
      };
      
      return {
        runId: nextRunId,
        timeline,
        stepBindings: bindings
      };
    });
  },
  clearRun: () => {
    set({
      runId: null,
      assistantMessages: [],
      timeline: [],
      stepBindings: {},
      replayReport: null,
      error: null
    });
  }
}));
