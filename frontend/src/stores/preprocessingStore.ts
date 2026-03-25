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
import { createDatasetConfigSlice } from './preprocessingSlices/datasetConfigSlice';
import { createRunManagementSlice } from './preprocessingSlices/runManagementSlice';
import { createTransformationPipelineSlice } from './preprocessingSlices/transformationPipelineSlice';

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

export interface PreprocessingState {
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

export const usePreprocessingStore = create<PreprocessingState>()(
  persist(
    (set, get) => {
      // Compose all three slices
      const datasetSlice = createDatasetConfigSlice(set, get);
      const runSlice = createRunManagementSlice(set, get);
      const pipelineSlice = createTransformationPipelineSlice(set, get);

      // Create an augmented dataset slice with project-switch coordination
      const loadTablesWithCoordination = async (projectId: string) => {
        const previousProjectId = get().activeProjectId;
        const switchedProject = previousProjectId !== null && previousProjectId !== projectId;

        if (switchedProject) {
          // Project switch: reset all slices
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
          set((state: PreprocessingState) => {
            const selectedStillValid = Boolean(
              state.selectedDatasetId && tables.some((table: AvailableTable) => table.datasetId === state.selectedDatasetId)
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
      };

      // Create an augmented dataset slice with run-state clearing
      const selectDatasetWithCoordination = (datasetId: string) => {
        set((state: PreprocessingState) => {
          const exists = state.tables.some((table: AvailableTable) => table.datasetId === datasetId);
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
      };

      const applyTabSnapshot = (snapshot: {
        selectedDatasetId: string | null;
        runId: string | null;
        timeline: TransformationEvent[];
        stepBindings: Record<string, StepCellBinding>;
        replayReport: ReplayCompatibilityReport | null;
      }) => {
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
      };

      const hydrateRunSnapshot = (snapshot: PreprocessingRunSnapshot) => {
        set((state: PreprocessingState) => ({
          runId: snapshot.runId,
          latestCheckpointId: getLatestCheckpointId(snapshot),
          selectedDatasetId: snapshot.activeDatasetId ?? state.selectedDatasetId,
          timeline: buildTimelineFromSnapshot(snapshot),
          stepBindings: buildStepBindingsFromSnapshot(snapshot),
          replayReport: null,
          controllerSummary: null,
          error: null
        }));
      };

      return {
        ...initialState,
        ...datasetSlice,
        ...runSlice,
        ...pipelineSlice,
        // Override with coordinated versions
        loadTables: loadTablesWithCoordination,
        selectDataset: selectDatasetWithCoordination,
        applyTabSnapshot,
        hydrateRunSnapshot,
        hydrateRunById: async (projectId: string, snapshotRunId: string) => {
          if (isWorkflowThreadId(snapshotRunId)) {
            console.warn('[preprocessingStore] Ignoring stale workflow thread reference used as runId:', snapshotRunId);
            set({ runId: null, timeline: [], stepBindings: {}, error: null });
            return;
          }

          try {
            const { run } = await getPreprocessingRunSnapshot(snapshotRunId, projectId);
            hydrateRunSnapshot(run);
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
        }
      };
    },
    {
      name: 'automl-preprocessing-lifecycle-v1',
      version: 1,
      partialize: (state: PreprocessingState) => ({
        activeProjectId: state.activeProjectId,
        selectedDatasetId: state.selectedDatasetId,
        runId: state.runId
      })
    }
  )
);
