import { create } from 'zustand';

import type { ModelRecord, ModelTemplate, TrainModelRequest } from '@/types/model';
import * as modelApi from '@/lib/api/models';

interface ModelState {
  templates: ModelTemplate[];
  models: ModelRecord[];
  isLoadingTemplates: boolean;
  isLoadingModels: boolean;
  isTraining: boolean;
  error: string | null;
  fetchTemplates: () => Promise<void>;
  refreshModels: (projectId?: string) => Promise<void>;
  trainModel: (request: TrainModelRequest) => Promise<ModelRecord | null>;
}

export const useModelStore = create<ModelState>((set, get) => ({
  templates: [],
  models: [],
  isLoadingTemplates: false,
  isLoadingModels: false,
  isTraining: false,
  error: null,

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
    if (get().isLoadingModels) return;
    set({ isLoadingModels: true, error: null });
    try {
      const response = await modelApi.listModels(projectId);
      set({ models: response.models, isLoadingModels: false });
    } catch (error) {
      set({
        isLoadingModels: false,
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
        models: [response.model, ...state.models],
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
  }
}));
