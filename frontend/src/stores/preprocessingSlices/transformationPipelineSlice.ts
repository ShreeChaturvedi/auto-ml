import type { StateCreator } from 'zustand';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { NotebookCell } from '@/types/notebook';
import type {
  PreprocessingControllerSummary,
  StepCellBinding,
  TransformationEvent
} from '@/types/preprocessing';
import type { PreprocessingState } from '../preprocessingStore';
import {
  applyDivergence,
  computeDivergenceUpdate
} from '../preprocessing/divergenceSync';
import { evaluateReplayCompat } from '../preprocessing/replayCompat';
import { commitStepDecision } from '../preprocessing/stepDecision';
import {
  applyEditStepCode,
  applyMarkInterrupted,
  applyProcessToolCall,
  applyProcessToolResult
} from '../preprocessing/timelineOps';

export interface ReplayCompatibilityReport {
  checkedAt: number;
  compatible: boolean;
  issues: string[];
  source: 'backend_authoritative' | 'local_precheck';
  precheckIssues?: string[];
  checkpointId?: string;
}

export interface TransformationPipelineState {
  timeline: TransformationEvent[];
  stepBindings: Record<string, StepCellBinding>;
  replayReport: ReplayCompatibilityReport | null;
  controllerSummary: PreprocessingControllerSummary | null;
  approveStep: (projectId: string, stepId: string) => Promise<void>;
  rejectStep: (projectId: string, stepId: string, reason?: string) => Promise<void>;
  editStepCode: (stepId: string, code: string) => void;
  syncDivergence: (cells: NotebookCell[]) => Promise<void>;
  evaluateReplayCompatibility: (projectId: string) => Promise<void>;
  markInterruptedSteps: (reason: string) => void;
  processToolCall: (call: ToolCall, fallbackRunId?: string) => void;
  processToolResult: (call: ToolCall, result: ToolResult, fallbackRunId?: string) => void;
  setControllerSummary: (summary: PreprocessingControllerSummary | null) => void;
}

export const createTransformationPipelineSlice: StateCreator<
  PreprocessingState,
  [['zustand/persist', unknown]],
  [],
  TransformationPipelineState
> = (set, get: () => PreprocessingState, _store) => ({  // eslint-disable-line @typescript-eslint/no-unused-vars
  timeline: [],
  stepBindings: {},
  replayReport: null,
  controllerSummary: null,

  approveStep: async (projectId: string, stepId: string) => {
    const state = get();
    const event = state.timeline.find((candidate: TransformationEvent) => candidate.stepId === stepId);
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
    const event = state.timeline.find((candidate: TransformationEvent) => candidate.stepId === stepId);
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
    set((state: PreprocessingState) => applyEditStepCode(state.timeline, state.stepBindings, stepId, code));
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

    set((state: PreprocessingState) => ({
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
    set((state: PreprocessingState) => applyMarkInterrupted(state.timeline, reason));
  },

  processToolCall: (call: ToolCall, fallbackRunId?: string) => {
    const update = applyProcessToolCall(get().timeline, call, fallbackRunId || null);
    if (!update) return;
    set(update);
  },

  processToolResult: (call: ToolCall, result: ToolResult, fallbackRunId?: string) => {
    set((state: PreprocessingState) => {
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

  setControllerSummary: (controllerSummary: PreprocessingControllerSummary | null) => {
    set({ controllerSummary });
  }
});
