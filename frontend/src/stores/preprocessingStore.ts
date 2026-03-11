import { create } from 'zustand';

import { getPreprocessingRunSnapshot } from '@/lib/api/llm';
import { listAvailableTables } from '@/lib/api/preprocessing';
import { asRecord, asString } from '@/lib/typeCoercion';
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
  getLatestCheckpointId,
  getRunIdFromToolResult,
  hashText,
  upsertTimelineEvent
} from './preprocessing/eventBuilders';
import { applyDivergence, computeDivergenceUpdate } from './preprocessing/divergenceSync';
import { evaluateReplayCompat } from './preprocessing/replayCompat';
import { commitStepDecision } from './preprocessing/stepDecision';

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
    const stateSnapshot = get();
    const hashByCellId = await computeDivergenceUpdate({
      cells,
      stepBindings: stateSnapshot.stepBindings
    });

    if (!hashByCellId) {
      return;
    }

    set((state) => ({
      timeline: applyDivergence(state.timeline, state.stepBindings, hashByCellId)
    }));
  },

  evaluateReplayCompatibility: async (projectId: string) => {
    const state = get();
    const report = await evaluateReplayCompat({
      projectId,
      tables: state.tables,
      selectedDatasetId: state.selectedDatasetId,
      timeline: state.timeline,
      runId: state.runId,
      latestCheckpointId: state.latestCheckpointId
    });

    set({ replayReport: report, error: null });
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
