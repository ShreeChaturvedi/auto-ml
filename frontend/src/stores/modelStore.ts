import { create } from 'zustand';

import type { ModelRecord, ModelTemplate, TrainModelRequest } from '@/types/model';
import * as modelApi from '@/lib/api/models';
import { useExperimentsStore } from './experimentsStore';

export interface TrainingRunState {
  experimentId: string;
  experimentName: string;
  modelType: string;
  status: 'configured' | 'proposed' | 'training' | 'evaluated' | 'registered' | 'failed';
  metrics?: Record<string, unknown>;
  hyperparameters?: Record<string, unknown>;
}

interface ModelState {
  templates: ModelTemplate[];
  models: ModelRecord[];
  modelsProjectId: string | null;
  isLoadingTemplates: boolean;
  isLoadingModels: boolean;
  activeModelsRequestScope: string | null;
  isTraining: boolean;
  error: string | null;
  /** Training lifecycle state */
  trainingRunStates: Record<string, TrainingRunState>;
  currentStage: string | null;
  trainingRunId: string | null;
  fetchTemplates: () => Promise<void>;
  refreshModels: (projectId?: string) => Promise<void>;
  trainModel: (request: TrainModelRequest) => Promise<ModelRecord | null>;
  updateTrainingRun: (experimentId: string, state: Partial<TrainingRunState>) => void;
  setCurrentStage: (stage: string | null) => void;
  setTrainingRunId: (runId: string | null) => void;
  deleteModel: (modelId: string) => Promise<void>;
  clearTrainingRun: () => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  templates: [],
  models: [],
  modelsProjectId: null,
  isLoadingTemplates: false,
  isLoadingModels: false,
  activeModelsRequestScope: null,
  isTraining: false,
  error: null,
  trainingRunStates: {},
  currentStage: null,
  trainingRunId: null,

  fetchTemplates: async () => {
    if (get().isLoadingTemplates) return;
    set({ isLoadingTemplates: true, error: null });
    try {
      const response = await modelApi.listModelTemplates();
      set({ templates: response.templates, isLoadingTemplates: false });
    } catch (error) {
      set({
        isLoadingTemplates: false,
        error: error instanceof Error ? error.message : 'Failed to load model templates.'
      });
    }
  },

  refreshModels: async (projectId) => {
    const requestScope = projectId ?? '__all__';
    const state = get();
    if (state.activeModelsRequestScope === requestScope) {
      return;
    }

    const hasWarmProjectModels = state.modelsProjectId === (projectId ?? null);
    set({
      activeModelsRequestScope: requestScope,
      isLoadingModels: hasWarmProjectModels ? state.isLoadingModels : true,
      error: null
    });

    try {
      const response = await modelApi.listModels(projectId);
      set({
        models: response.models,
        modelsProjectId: projectId ?? null,
        isLoadingModels: false,
        activeModelsRequestScope: null
      });
    } catch (error) {
      set({
        isLoadingModels: false,
        activeModelsRequestScope: null,
        error: error instanceof Error ? error.message : 'Failed to load models.'
      });
    }
  },

  trainModel: async (request) => {
    if (get().isTraining) return null;
    set({ isTraining: true, error: null });
    try {
      const response = await modelApi.trainModel(request);
      set((state) => ({
        models:
          state.modelsProjectId === response.model.projectId
            ? [response.model, ...state.models.filter((model) => model.modelId !== response.model.modelId)]
            : [response.model],
        modelsProjectId: response.model.projectId,
        isTraining: false
      }));
      return response.model;
    } catch (error) {
      set({
        isTraining: false,
        error: error instanceof Error ? error.message : 'Failed to train model.'
      });
      return null;
    }
  },

  updateTrainingRun: (experimentId, partial) => {
    set((state) => ({
      trainingRunStates: {
        ...state.trainingRunStates,
        [experimentId]: {
          ...state.trainingRunStates[experimentId],
          ...partial
        } as TrainingRunState
      }
    }));
  },

  setCurrentStage: (stage) => {
    if (get().currentStage === stage) return;
    set({ currentStage: stage });
  },

  setTrainingRunId: (runId) => {
    if (get().trainingRunId === runId) return;
    set({ trainingRunId: runId });
  },

  deleteModel: async (modelId) => {
    try {
      await modelApi.deleteModel(modelId);
      set((state) => ({
        models: state.models.filter((m) => m.modelId !== modelId),
      }));
      const expStore = useExperimentsStore.getState();
      if (expStore.selectedModelId === modelId) {
        expStore.selectModel(null);
      }
      if (expStore.comparisonModelIds.includes(modelId)) {
        expStore.toggleComparison(modelId);
      }
      expStore.purgeModelCache(modelId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete model.',
      });
    }
  },

  clearTrainingRun: () => {
    set({
      trainingRunId: null,
      currentStage: null,
      trainingRunStates: {},
      isTraining: false,
      error: null
    });
  }
}));
