import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { ApiError } from '@/lib/api/client';
import { getPreprocessingRunSnapshot } from '@/lib/api/llm';
import { listAvailableTables } from '@/lib/api/preprocessing';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { NotebookCell } from '@/types/notebook';
import type {
  AvailableTable,
  PreprocessingControllerSummary,
  PreprocessingRunSnapshot,
  StepCellBinding,
  TransformationEvent
} from '@/types/preprocessing';
import { isWorkflowThreadId } from '@/lib/workflowThread';
import {
  buildStepBindingsFromSnapshot,
  buildTimelineFromSnapshot,
  getLatestCheckpointId
} from './preprocessing/eventBuilders';
import { applyDivergence, computeDivergenceUpdate } from './preprocessing/divergenceSync';
import { evaluateReplayCompat } from './preprocessing/replayCompat';
import { commitStepDecision } from './preprocessing/stepDecision';
import {
  applyEditStepCode,
  applyMarkInterrupted,
  applyProcessToolCall,
  applyProcessToolResult
} from './preprocessing/timelineOps';

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
  controllerSummary: PreprocessingControllerSummary | null;
  isLoadingTables: boolean;
  error: string | null;
  loadTables: (projectId: string) => Promise<void>;
  selectDataset: (datasetId: string) => void;
  setRunId: (runId: string | null) => void;
  setNextRunCellMode: (mode: DatasetContinuityMode) => void;
  consumeRunCellMode: () => DatasetContinuityMode;
  applyTabSnapshot: (snapshot: {
    selectedDatasetId: string | null;
    runId: string | null;
    timeline: TransformationEvent[];
    stepBindings: Record<string, StepCellBinding>;
    replayReport: ReplayCompatibilityReport | null;
  }) => void;
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
  setControllerSummary: (summary: PreprocessingControllerSummary | null) => void;
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
  | 'controllerSummary'
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
  controllerSummary: null,
  isLoadingTables: false,
  error: null
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePreprocessingStore = create<PreprocessingState>()(persist((set, get) => ({
  ...initialState,

  loadTables: async (projectId: string) => {
    const previousProjectId = get().activeProjectId;
    const switchedProject = previousProjectId !== null && previousProjectId !== projectId;

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
        controllerSummary: null,
        isLoadingTables: true,
        error: null
      });
    } else {
      set({ activeProjectId: projectId, isLoadingTables: true, error: null });
    }

    try {
      const { tables } = await listAvailableTables(projectId);
      set((state) => {
        const selectedStillValid = Boolean(
          state.selectedDatasetId && tables.some((table) => table.datasetId === state.selectedDatasetId)
        );

        // Preserve selectedDatasetId if it's still valid, or if we're not switching projects
        if (selectedStillValid || !switchedProject) {
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
          controllerSummary: null,
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
        controllerSummary: null,
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

  applyTabSnapshot: (snapshot) => {
    set({
      selectedDatasetId: snapshot.selectedDatasetId,
      runId: snapshot.runId,
      nextRunCellMode: 'continue',
      latestCheckpointId: null,
      assistantMessages: [],
      timeline: snapshot.timeline,
      stepBindings: snapshot.stepBindings,
      replayReport: snapshot.replayReport,
      controllerSummary: null,
      error: null
    });
  },

  hydrateRunSnapshot: (snapshot) => {
    set((state) => ({
      runId: snapshot.runId,
      latestCheckpointId: getLatestCheckpointId(snapshot),
      selectedDatasetId: snapshot.activeDatasetId ?? state.selectedDatasetId,
      timeline: buildTimelineFromSnapshot(snapshot),
      stepBindings: buildStepBindingsFromSnapshot(snapshot),
      replayReport: null,
      controllerSummary: null,
      error: null
    }));
  },

  hydrateRunById: async (projectId: string, snapshotRunId: string) => {
    if (isWorkflowThreadId(snapshotRunId)) {
      console.warn('[preprocessingStore] Ignoring stale workflow thread reference used as runId:', snapshotRunId);
      set({ runId: null, timeline: [], stepBindings: {}, error: null });
      return;
    }

    try {
      const { run } = await getPreprocessingRunSnapshot(snapshotRunId, projectId);
      get().hydrateRunSnapshot(run);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        console.warn('[preprocessingStore] Stale run reference cleared (run no longer exists):', snapshotRunId);
        set({ runId: null, timeline: [], stepBindings: {}, error: null });
        return;
      }
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
    set((state) => applyEditStepCode(state.timeline, state.stepBindings, stepId, code));
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
    set((state) => applyMarkInterrupted(state.timeline, reason));
  },

  processToolCall: (call, fallbackRunId) => {
    const update = applyProcessToolCall(get().timeline, call, fallbackRunId || null);
    if (!update) return;
    set(update);
  },

  processToolResult: (call, result, fallbackRunId) => {
    set((state) => {
      const update = applyProcessToolResult(
        {
          runId: state.runId,
          latestCheckpointId: state.latestCheckpointId,
          timeline: state.timeline,
          stepBindings: state.stepBindings
        },
        call,
        result,
        fallbackRunId || null
      );
      return update ?? {};
    });
  },

  setControllerSummary: (controllerSummary) => {
    set({ controllerSummary });
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
      controllerSummary: null,
      error: null
    });
  }
}), {
  name: 'automl-preprocessing-lifecycle-v1',
  version: 1,
  partialize: (state) => ({
    activeProjectId: state.activeProjectId,
    selectedDatasetId: state.selectedDatasetId,
    runId: state.runId
  })
}));
