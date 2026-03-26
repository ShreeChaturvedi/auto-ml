import type { StateCreator } from 'zustand';
import { ApiError } from '@/lib/api/client';
import { getPreprocessingRunSnapshot } from '@/lib/api/llm';
import { isWorkflowThreadId } from '@/lib/workflowThread';
import type { PreprocessingRunSnapshot } from '@/types/preprocessing';
import { getLatestCheckpointId } from '../preprocessing/eventBuilders';
import type { PreprocessingState } from '../preprocessingStore';

export type DatasetContinuityMode = 'continue' | 'restart_from_original';

export interface RunManagementState {
  runId: string | null;
  nextRunCellMode: DatasetContinuityMode;
  latestCheckpointId: string | null;
  assistantMessages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
  setRunId: (runId: string | null) => void;
  setNextRunCellMode: (mode: DatasetContinuityMode) => void;
  consumeRunCellMode: () => DatasetContinuityMode;
  hydrateRunSnapshot: (snapshot: PreprocessingRunSnapshot) => void;
  hydrateRunById: (projectId: string, runId: string) => Promise<void>;
  clearRun: () => void;
}

export const createRunManagementSlice: StateCreator<
  PreprocessingState,
  [['zustand/persist', unknown]],
  [],
  RunManagementState
> = (set, get: () => PreprocessingState, _store) => ({  // eslint-disable-line @typescript-eslint/no-unused-vars
  runId: null,
  nextRunCellMode: 'continue',
  latestCheckpointId: null,
  assistantMessages: [],

  setRunId: (nextRunId: string | null) => {
    set({ runId: nextRunId, latestCheckpointId: nextRunId ? get().latestCheckpointId : null });
  },

  setNextRunCellMode: (mode: DatasetContinuityMode) => {
    set({ nextRunCellMode: mode });
  },

  consumeRunCellMode: () => {
    const mode = get().nextRunCellMode;
    if (mode !== 'continue') {
      set({ nextRunCellMode: 'continue' });
    }
    return mode;
  },

  hydrateRunSnapshot: (snapshot: PreprocessingRunSnapshot) => {
    set((state: PreprocessingState) => ({
      runId: snapshot.runId,
      latestCheckpointId: getLatestCheckpointId(snapshot),
      assistantMessages: state.assistantMessages,
      error: null
    }));
  },

  hydrateRunById: async (projectId: string, snapshotRunId: string) => {
    if (isWorkflowThreadId(snapshotRunId)) {
      console.warn('[preprocessingStore] Ignoring stale workflow thread reference used as runId:', snapshotRunId);
      set({ runId: null, error: null });
      return;
    }

    try {
      const { run } = await getPreprocessingRunSnapshot(snapshotRunId, projectId);
      get().hydrateRunSnapshot(run);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        console.warn('[preprocessingStore] Stale run reference cleared (run no longer exists):', snapshotRunId);
        set({ runId: null, error: null });
        return;
      }
      console.error('[preprocessingStore] Failed to hydrate preprocessing run snapshot:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to hydrate preprocessing run snapshot'
      });
    }
  },

  clearRun: () => {
    set({
      runId: null,
      nextRunCellMode: 'continue',
      latestCheckpointId: null,
      assistantMessages: [],
      controllerSummary: null,
      error: null
    });
  }
});
