import type { StateCreator } from 'zustand';
import { listAvailableTables } from '@/lib/api/preprocessing';
import type { AvailableTable } from '@/types/preprocessing';
import type { PreprocessingState } from '../preprocessingStore';

export interface DatasetConfigState {
  activeProjectId: string | null;
  tables: AvailableTable[];
  selectedDatasetId: string | null;
  isLoadingTables: boolean;
  error: string | null;
  loadTables: (projectId: string) => Promise<void>;
  selectDataset: (datasetId: string, options?: { preserveRunState?: boolean }) => void;
}

export const createDatasetConfigSlice: StateCreator<
  PreprocessingState,
  [['zustand/persist', unknown]],
  [],
  DatasetConfigState
> = (set, get: () => PreprocessingState, _store) => ({  // eslint-disable-line @typescript-eslint/no-unused-vars
  activeProjectId: null,
  tables: [],
  selectedDatasetId: null,
  isLoadingTables: false,
  error: null,

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
  },

  selectDataset: (datasetId: string, options?: { preserveRunState?: boolean }) => {
    set((state: PreprocessingState) => {
      const exists = state.tables.some((table: AvailableTable) => table.datasetId === datasetId);
      if (!exists) {
        return {
          error: 'Selected dataset is unavailable in this project. Please choose another dataset.'
        };
      }

      if (options?.preserveRunState) {
        return {
          selectedDatasetId: datasetId,
          error: null
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
  }
});
