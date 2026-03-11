import { create } from 'zustand';

import { executeToolCalls, getPreprocessingRunSnapshot } from '@/lib/api/llm';
import { listAvailableTables } from '@/lib/api/preprocessing';
import { asBoolean, asRecord, asString, asStringArray } from '@/lib/typeCoercion';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { NotebookCell } from '@/types/notebook';
import type {
  AvailableTable,
  PreprocessingRunSnapshot,
  StepCellBinding,
  TransformationEvent,
  TransformationStatus
} from '@/types/preprocessing';
import {
  buildEventFromToolCall,
  buildEventFromToolResult,
  buildStepBindingsFromSnapshot,
  buildTimelineFromSnapshot,
  extractReferencedColumns,
  getLatestCheckpointId,
  getRunIdFromToolResult,
  hashText,
  hashTextAuthoritative,
  upsertTimelineEvent
} from './preprocessing/eventBuilders';

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

// ---------------------------------------------------------------------------
// Shared step-decision helper (deduplicates approveStep / rejectStep)
// ---------------------------------------------------------------------------

interface CommitStepDecisionArgs {
  projectId: string;
  stepId: string;
  runId: string;
  selectedDatasetId: string | null;
  approved: boolean;
  /** Only relevant when approved is false. */
  rejectionReason?: string;
  previousStatus: TransformationStatus;
  set: (
    partial:
      | Partial<PreprocessingStateData>
      | ((state: PreprocessingStateData) => Partial<PreprocessingStateData>)
  ) => void;
  hydrateRunById: (projectId: string, runId: string) => Promise<void>;
}

async function commitStepDecision({
  projectId,
  stepId,
  runId,
  selectedDatasetId,
  approved,
  rejectionReason,
  previousStatus,
  set,
  hydrateRunById
}: CommitStepDecisionArgs): Promise<void> {
  const action = approved ? 'approve' : 'reject';

  // Optimistically mark the step as running.
  set((current) => ({
    timeline: current.timeline.map((candidate) =>
      candidate.stepId === stepId
        ? { ...candidate, status: 'running', error: undefined, updatedAt: Date.now() }
        : candidate
    ),
    error: null
  }));

  try {
    const toolArgs: Record<string, unknown> = {
      runId,
      stepId,
      approved,
      ...(approved && selectedDatasetId ? { datasetId: selectedDatasetId } : {}),
      ...(!approved && rejectionReason ? { rejectionReason } : {})
    };

    const response = await executeToolCalls(
      projectId,
      [{ id: `${action}-${stepId}-${Date.now()}`, tool: 'commit_transformation_step', args: toolArgs }],
      undefined,
      'user_approval'
    );

    const result = response.results[0];
    const output = asRecord(result?.output);
    const isError = Boolean(result?.error) || asBoolean(output?.isError) === true;

    if (isError) {
      const message =
        result?.error ??
        asString(output?.message) ??
        asString(output?.reasonCode) ??
        `Failed to ${action} step ${stepId}.`;
      set((current) => ({
        timeline: current.timeline.map((candidate) =>
          candidate.stepId === stepId
            ? { ...candidate, status: previousStatus, error: message, updatedAt: Date.now() }
            : candidate
        ),
        error: message
      }));
      return;
    }

    const nextRunId = asString(output?.runId) ?? runId;
    await hydrateRunById(projectId, nextRunId);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Failed to ${action} step ${stepId}.`;
    set((current) => ({
      timeline: current.timeline.map((candidate) =>
        candidate.stepId === stepId
          ? { ...candidate, status: previousStatus, error: message, updatedAt: Date.now() }
          : candidate
      ),
      error: message
    }));
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

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
    if (!runId) {
      set({ error: 'Cannot approve step without an active preprocessing run.' });
      return;
    }
    await commitStepDecision({
      projectId,
      stepId,
      runId,
      selectedDatasetId: state.selectedDatasetId,
      approved: true,
      previousStatus: event?.status ?? 'awaiting_approval',
      set,
      hydrateRunById: get().hydrateRunById
    });
  },

  rejectStep: async (projectId: string, stepId: string, reason?: string) => {
    const state = get();
    const event = state.timeline.find((candidate) => candidate.stepId === stepId);
    const runId = event?.runId ?? state.runId;
    if (!runId) {
      set({ error: 'Cannot reject step without an active preprocessing run.' });
      return;
    }
    await commitStepDecision({
      projectId,
      stepId,
      runId,
      selectedDatasetId: state.selectedDatasetId,
      approved: false,
      rejectionReason: reason?.trim() || 'Rejected by user',
      previousStatus: event?.status ?? 'awaiting_approval',
      set,
      hydrateRunById: get().hydrateRunById
    });
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
          return { ...event, status: 'diverged', updatedAt: Date.now() };
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
          : Array.isArray(output?.compatibilityIssues)
            ? (output.compatibilityIssues as Array<Record<string, unknown>>).map((issue) => {
                const issueStepId = asString(issue.stepId) ?? 'unknown-step';
                const column = asString(issue.column) ?? 'unknown-column';
                const issueType = asString(issue.issue) ?? 'incompatibility';
                return `${issueStepId}: ${issueType} on ${column}`;
              })
            : [];

        const backendIncompatible =
          Boolean(result?.error) ||
          asBoolean(output?.isError) === true ||
          asString(output?.reasonCode) === 'REPLAY_INCOMPATIBLE_DATASET';

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

      return { timeline: nextTimeline, error: message };
    });
  },

  processToolCall: (call, fallbackRunId) => {
    const event = buildEventFromToolCall(call, fallbackRunId || null);
    if (!event) return;
    set((state) => ({
      timeline: upsertTimelineEvent(state.timeline, event)
    }));
  },

  processToolResult: (call, result, fallbackRunId) => {
    const event = buildEventFromToolResult(call, result, fallbackRunId || null);
    if (!event) return;

    set((state) => {
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
