import { create } from 'zustand';

import { executeToolCalls, getPreprocessingRunSnapshot } from '@/lib/api/llm';
import { listAvailableTables } from '@/lib/api/preprocessing';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { NotebookCell } from '@/types/notebook';
import type {
  AvailableTable,
  PreprocessingRunSnapshot,
  StepCellBinding,
  TransformationEvent,
  TransformationStatus
} from '@/types/preprocessing';

const SEMANTIC_TOOL_NAMES = new Set([
  'propose_transformation_step',
  'materialize_step_code',
  'execute_transformation_step',
  'validate_step_result',
  'commit_transformation_step',
  'detect_step_divergence',
  'reconcile_diverged_step'
]);


const PHASE_STATUS_BY_TOOL: Record<string, TransformationStatus> = {
  propose_transformation_step: 'pending',
  materialize_step_code: 'running',
  execute_transformation_step: 'running',
  validate_step_result: 'running',
  commit_transformation_step: 'running',
  detect_step_divergence: 'running',
  reconcile_diverged_step: 'running'
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

export type DatasetContinuityMode = 'continue' | 'restart_from_original';

export interface ReplayCompatibilityReport {
  checkedAt: number;
  compatible: boolean;
  issues: string[];
  source: 'backend_authoritative' | 'local_precheck';
  precheckIssues?: string[];
  checkpointId?: string;
}

interface PreprocessingState {
  activeProjectId: string | null;
  tables: AvailableTable[];
  selectedDatasetId: string | null;
  runId: string | null;
  nextRunCellMode: DatasetContinuityMode;
  latestCheckpointId: string | null;
  assistantMessages: PreprocessingChatMessage[];
  timeline: TransformationEvent[];
  stepBindings: Record<string, StepCellBinding>;
  replayReport: ReplayCompatibilityReport | null;
  isLoadingTables: boolean;
  error: string | null;
  loadTables: (projectId: string) => Promise<void>;
  selectDataset: (datasetId: string) => void;
  setRunId: (runId: string | null) => void;
  setNextRunCellMode: (mode: DatasetContinuityMode) => void;
  consumeRunCellMode: () => DatasetContinuityMode;
  hydrateRunSnapshot: (snapshot: PreprocessingRunSnapshot) => void;
  hydrateRunById: (projectId: string, runId: string) => Promise<void>;
  approveStep: (projectId: string, stepId: string) => Promise<void>;
  rejectStep: (projectId: string, stepId: string, reason?: string) => Promise<void>;
  editStepCode: (stepId: string, code: string) => void;
  syncDivergence: (cells: NotebookCell[]) => Promise<void>;
  evaluateReplayCompatibility: (projectId: string) => Promise<void>;
  clearRun: () => void;
  markInterruptedSteps: (reason: string) => void;
  processToolCall: (call: ToolCall, fallbackRunId?: string) => void;
  processToolResult: (call: ToolCall, result: ToolResult, fallbackRunId?: string) => void;
}

type PreprocessingStateData = Pick<
  PreprocessingState,
  | 'activeProjectId'
  | 'tables'
  | 'selectedDatasetId'
  | 'runId'
  | 'nextRunCellMode'
  | 'latestCheckpointId'
  | 'assistantMessages'
  | 'timeline'
  | 'stepBindings'
  | 'replayReport'
  | 'isLoadingTables'
  | 'error'
>;

const initialState: PreprocessingStateData = {
  activeProjectId: null,
  tables: [],
  selectedDatasetId: null,
  runId: null,
  nextRunCellMode: 'continue',
  latestCheckpointId: null,
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
    approvalDecision: asString(step?.approvalDecision) as TransformationEvent['approvalDecision'],
    decisionReason: asString(step?.decisionReason),
    output: result.output,
    error: result.error ?? asString(step?.decisionReason),
    createdAt: now,
    updatedAt: now
  };
}

function toTimestamp(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildTimelineFromSnapshot(snapshot: PreprocessingRunSnapshot): TransformationEvent[] {
  const fallbackTime = Date.now();
  return snapshot.steps
    .map((step) => ({
      id: `evt-${step.stepId}`,
      runId: snapshot.runId,
      stepId: step.stepId,
      toolName: 'snapshot_hydration',
      title: step.title,
      status: step.status,
      approvalDecision: step.approvalDecision,
      decisionReason: step.decisionReason,
      rationale: step.rationale,
      intentType: step.intentType,
      code: step.code,
      codeHash: step.codeHash,
      version: step.version,
      cellIds: step.cellIds ?? [],
      validation: step.validation,
      requiresApproval: step.requiresApproval,
      error: step.status === 'failed' ? step.decisionReason : undefined,
      createdAt: toTimestamp(step.createdAt, fallbackTime),
      updatedAt: toTimestamp(step.updatedAt, fallbackTime)
    }))
    .sort((left, right) => left.createdAt - right.createdAt);
}

function buildStepBindingsFromSnapshot(snapshot: PreprocessingRunSnapshot): Record<string, StepCellBinding> {
  const bindings: Record<string, StepCellBinding> = {};
  const fallbackTime = Date.now();
  for (const step of snapshot.steps) {
    bindings[step.stepId] = {
      stepId: step.stepId,
      cellIds: step.cellIds ?? [],
      codeHash: step.codeHash,
      version: step.version,
      lastSyncedAt: toTimestamp(step.updatedAt, fallbackTime)
    };
  }
  return bindings;
}

function getLatestCheckpointId(snapshot: PreprocessingRunSnapshot): string | null {
  const latest = snapshot.checkpoints[snapshot.checkpoints.length - 1] as { checkpointId?: unknown } | undefined;
  return typeof latest?.checkpointId === 'string' && latest.checkpointId.trim()
    ? latest.checkpointId
    : null;
}

function extractReferencedColumns(code: string): string[] {
  const matches = [...code.matchAll(/\[['"]([A-Za-z0-9_ -]+)['"]\]/g)];
  return [...new Set(matches.map((match) => match[1]).filter(Boolean))];
}

async function hashTextAuthoritative(value: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) {
    return null;
  }
  const encoded = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 24);
}

export const usePreprocessingStore = create<PreprocessingState>((set, get) => ({
  ...initialState,

  loadTables: async (projectId: string) => {
    const previousProjectId = get().activeProjectId;
    const switchedProject = previousProjectId !== projectId;

    if (switchedProject) {
      set({
        activeProjectId: projectId,
        tables: [],
        selectedDatasetId: null,
        runId: null,
        nextRunCellMode: 'continue',
        latestCheckpointId: null,
        assistantMessages: [],
        timeline: [],
        stepBindings: {},
        replayReport: null,
        isLoadingTables: true,
        error: null
      });
    } else {
      set({ isLoadingTables: true, error: null });
    }

    try {
      const { tables } = await listAvailableTables(projectId);
      set((state) => {
        const hasSelectedDataset = Boolean(
          state.selectedDatasetId && tables.some((table) => table.datasetId === state.selectedDatasetId)
        );

        if (hasSelectedDataset) {
          return { tables, isLoadingTables: false, error: null };
        }

        return {
          tables,
          selectedDatasetId: null,
          runId: null,
          nextRunCellMode: 'continue',
          latestCheckpointId: null,
          assistantMessages: [],
          timeline: [],
          stepBindings: {},
          replayReport: null,
          isLoadingTables: false,
          error: null
        };
      });
    } catch (error) {
      console.error('[preprocessingStore] Failed to load tables:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to load tables',
        isLoadingTables: false
      });
    }
  },

  selectDataset: (datasetId: string) => {
    set((state) => {
      const exists = state.tables.some((table) => table.datasetId === datasetId);
      if (!exists) {
        return {
          error: 'Selected dataset is unavailable in this project. Please choose another dataset.'
        };
      }

      return {
        selectedDatasetId: datasetId,
        runId: null,
        nextRunCellMode: 'continue',
        latestCheckpointId: null,
        assistantMessages: [],
        timeline: [],
        stepBindings: {},
        replayReport: null,
        error: null
      };
    });
  },

  setRunId: (nextRunId) => {
    set({ runId: nextRunId, latestCheckpointId: nextRunId ? get().latestCheckpointId : null });
  },

  setNextRunCellMode: (mode) => {
    set({ nextRunCellMode: mode });
  },

  consumeRunCellMode: () => {
    const mode = get().nextRunCellMode;
    if (mode !== 'continue') {
      set({ nextRunCellMode: 'continue' });
    }
    return mode;
  },

  hydrateRunSnapshot: (snapshot) => {
    set((state) => ({
      runId: snapshot.runId,
      latestCheckpointId: getLatestCheckpointId(snapshot),
      selectedDatasetId: snapshot.activeDatasetId ?? state.selectedDatasetId,
      timeline: buildTimelineFromSnapshot(snapshot),
      stepBindings: buildStepBindingsFromSnapshot(snapshot),
      replayReport: null,
      error: null
    }));
  },

  hydrateRunById: async (projectId: string, snapshotRunId: string) => {
    try {
      const { run } = await getPreprocessingRunSnapshot(snapshotRunId, projectId);
      get().hydrateRunSnapshot(run);
    } catch (error) {
      console.error('[preprocessingStore] Failed to hydrate preprocessing run snapshot:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to hydrate preprocessing run snapshot'
      });
    }
  },

  approveStep: async (projectId: string, stepId: string) => {
    const state = get();
    const event = state.timeline.find((candidate) => candidate.stepId === stepId);
    const runId = event?.runId ?? state.runId;
    const selectedDatasetId = state.selectedDatasetId;
    if (!runId) {
      set({ error: 'Cannot approve step without an active preprocessing run.' });
      return;
    }

    const previousStatus = event?.status ?? 'awaiting_approval';
    set((current) => ({
      timeline: current.timeline.map((candidate) =>
        candidate.stepId === stepId
          ? {
              ...candidate,
              status: 'running',
              error: undefined,
              updatedAt: Date.now()
            }
          : candidate
      ),
      error: null
    }));

    try {
      const response = await executeToolCalls(projectId, [
        {
          id: `approval-${stepId}-${Date.now()}`,
          tool: 'commit_transformation_step',
          args: {
            runId,
            stepId,
            approved: true,
            ...(selectedDatasetId ? { datasetId: selectedDatasetId } : {})
          }
        }
      ], undefined, 'user_approval');

      const result = response.results[0];
      const output = asRecord(result?.output);
      const isError = Boolean(result?.error) || asBoolean(output?.isError) === true;
      if (isError) {
        const message = result?.error
          ?? asString(output?.message)
          ?? asString(output?.reasonCode)
          ?? `Failed to approve step ${stepId}.`;
        set((current) => ({
          timeline: current.timeline.map((candidate) =>
            candidate.stepId === stepId
              ? {
                  ...candidate,
                  status: previousStatus,
                  error: message,
                  updatedAt: Date.now()
                }
              : candidate
          ),
          error: message
        }));
        return;
      }

      const nextRunId = asString(output?.runId) ?? runId;
      await get().hydrateRunById(projectId, nextRunId);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to approve step ${stepId}.`;
      set((current) => ({
        timeline: current.timeline.map((candidate) =>
          candidate.stepId === stepId
            ? {
                ...candidate,
                status: previousStatus,
                error: message,
                updatedAt: Date.now()
              }
            : candidate
        ),
        error: message
      }));
    }
  },

  rejectStep: async (projectId: string, stepId: string, reason?: string) => {
    const state = get();
    const event = state.timeline.find((candidate) => candidate.stepId === stepId);
    const runId = event?.runId ?? state.runId;
    if (!runId) {
      set({ error: 'Cannot reject step without an active preprocessing run.' });
      return;
    }

    const rejectionReason = reason?.trim() || 'Rejected by user';
    const previousStatus = event?.status ?? 'awaiting_approval';
    set((current) => ({
      timeline: current.timeline.map((candidate) =>
        candidate.stepId === stepId
          ? {
              ...candidate,
              status: 'running',
              error: undefined,
              updatedAt: Date.now()
            }
          : candidate
      ),
      error: null
    }));

    try {
      const response = await executeToolCalls(projectId, [
        {
          id: `rejection-${stepId}-${Date.now()}`,
          tool: 'commit_transformation_step',
          args: {
            runId,
            stepId,
            approved: false,
            rejectionReason
          }
        }
      ], undefined, 'user_approval');

      const result = response.results[0];
      const output = asRecord(result?.output);
      const isError = Boolean(result?.error) || asBoolean(output?.isError) === true;
      if (isError) {
        const message = result?.error
          ?? asString(output?.message)
          ?? asString(output?.reasonCode)
          ?? `Failed to reject step ${stepId}.`;
        set((current) => ({
          timeline: current.timeline.map((candidate) =>
            candidate.stepId === stepId
              ? {
                  ...candidate,
                  status: previousStatus,
                  error: message,
                  updatedAt: Date.now()
                }
              : candidate
          ),
          error: message
        }));
        return;
      }

      const nextRunId = asString(output?.runId) ?? runId;
      await get().hydrateRunById(projectId, nextRunId);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to reject step ${stepId}.`;
      set((current) => ({
        timeline: current.timeline.map((candidate) =>
          candidate.stepId === stepId
            ? {
                ...candidate,
                status: previousStatus,
                error: message,
                updatedAt: Date.now()
              }
            : candidate
        ),
        error: message
      }));
    }
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

  syncDivergence: async (cells: NotebookCell[]) => {
    if (!cells.length) {
      return;
    }

    const stateSnapshot = get();
    const contentByCellId = new Map(cells.map((cell) => [cell.cellId, cell.content]));
    const boundCellIdsToHash = new Set<string>();
    Object.values(stateSnapshot.stepBindings).forEach((binding) => {
      if (!binding?.codeHash || binding.cellIds.length === 0) {
        return;
      }
      binding.cellIds.forEach((cellId) => {
        const content = contentByCellId.get(cellId);
        if (typeof content === 'string') {
          boundCellIdsToHash.add(cellId);
        }
      });
    });

    if (boundCellIdsToHash.size === 0) {
      return;
    }

    const hashedEntries = await Promise.all(
      [...boundCellIdsToHash].map(async (cellId) => {
        const content = contentByCellId.get(cellId);
        if (typeof content !== 'string') {
          return [cellId, null] as const;
        }
        const hash = await hashTextAuthoritative(content);
        return [cellId, hash] as const;
      })
    );
    const hashByCellId = new Map(hashedEntries.filter((entry): entry is [string, string] => Boolean(entry[1])));
    if (hashByCellId.size === 0) {
      return;
    }

    set((state) => ({
      timeline: state.timeline.map((event) => {
        const binding = state.stepBindings[event.stepId];
        if (!binding?.codeHash || binding.cellIds.length === 0) {
          return event;
        }

        let comparedAnyBoundCell = false;
        const hasDiverged = binding.cellIds.some((cellId) => {
          const actualHash = hashByCellId.get(cellId);
          if (!actualHash) {
            return false;
          }
          comparedAnyBoundCell = true;
          return actualHash !== binding.codeHash;
        });

        if (!comparedAnyBoundCell) {
          return event;
        }

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

  evaluateReplayCompatibility: async (projectId: string) => {
    const state = get();
    const selectedTable = state.tables.find((table) => table.datasetId === state.selectedDatasetId);
    const availableColumns = new Set(selectedTable?.columns?.map((column) => column.name) ?? []);
    const localIssues: string[] = [];

    state.timeline.forEach((event) => {
      if (!event.code) {
        return;
      }
      const referencedColumns = extractReferencedColumns(event.code);
      const missingColumns = referencedColumns.filter((column) => !availableColumns.has(column));
      if (missingColumns.length > 0) {
        localIssues.push(`${event.title}: missing columns (${missingColumns.join(', ')})`);
      }
      if (event.validation?.schemaDrift) {
        localIssues.push(`${event.title}: schema drift detected in validation.`);
      }
    });

    if (state.runId && state.latestCheckpointId && state.selectedDatasetId) {
      try {
        const response = await executeToolCalls(projectId, [
          {
            id: `replay-check-${Date.now()}`,
            tool: 'restore_checkpoint',
            args: {
              runId: state.runId,
              checkpointId: state.latestCheckpointId,
              operation: 'compatibility_check',
              replayDatasetId: state.selectedDatasetId
            }
          }
        ]);
        const result = response.results[0];
        const output = asRecord(result?.output);
        const compatibilityIssues = asStringArray(output?.compatibilityIssues).length
          ? asStringArray(output?.compatibilityIssues)
          : (Array.isArray(output?.compatibilityIssues)
            ? (output.compatibilityIssues as Array<Record<string, unknown>>).map((issue) => {
                const stepId = asString(issue.stepId) ?? 'unknown-step';
                const column = asString(issue.column) ?? 'unknown-column';
                const issueType = asString(issue.issue) ?? 'incompatibility';
                return `${stepId}: ${issueType} on ${column}`;
              })
            : []);

        const backendIncompatible = Boolean(result?.error)
          || asBoolean(output?.isError) === true
          || asString(output?.reasonCode) === 'REPLAY_INCOMPATIBLE_DATASET';

        set({
          replayReport: {
            checkedAt: Date.now(),
            compatible: !backendIncompatible,
            issues: backendIncompatible ? compatibilityIssues : [],
            source: 'backend_authoritative',
            precheckIssues: localIssues,
            checkpointId: state.latestCheckpointId
          },
          error: null
        });
        return;
      } catch (error) {
        console.error('[preprocessingStore] Backend replay compatibility check failed:', error);
      }
    }

    set({
      replayReport: {
        checkedAt: Date.now(),
        compatible: localIssues.length === 0,
        issues: localIssues,
        source: 'local_precheck',
        precheckIssues: localIssues
      }
    });
  },

  markInterruptedSteps: (reason: string) => {
    const message = reason.trim() || 'Preprocessing run was interrupted before completion.';
    set((state) => {
      const nextTimeline = state.timeline.map((event) => {
        if (event.status !== 'pending' && event.status !== 'running') {
          return event;
        }

        return {
          ...event,
          status: 'failed' as TransformationStatus,
          error: event.error ?? `Interrupted before completion: ${message}`,
          updatedAt: Date.now()
        };
      });

      return {
        timeline: nextTimeline,
        error: message
      };
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
      
      const output = asRecord(result.output);
      const checkpointId = asString(output.checkpointId);

      return {
        runId: nextRunId,
        latestCheckpointId: checkpointId ?? state.latestCheckpointId,
        timeline,
        stepBindings: bindings
      };
    });
  },
  clearRun: () => {
    set({
      runId: null,
      nextRunCellMode: 'continue',
      latestCheckpointId: null,
      assistantMessages: [],
      timeline: [],
      stepBindings: {},
      replayReport: null,
      error: null
    });
  }
}));
