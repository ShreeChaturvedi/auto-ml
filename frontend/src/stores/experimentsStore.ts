import { create } from 'zustand';
import { toast } from 'sonner';

import type {
  EvaluationResult,
  ShapResult,
  ErrorAnalysisResult,
  FilterPredicate
} from '@/types/experiments';
import type { ModelRecord } from '@/types/model';
import * as experimentsApi from '@/lib/api/experiments';
import { accumulateTokenStream } from '@/lib/api/streamReader';

interface ExperimentsState {
  // Selection
  selectedModelId: string | null;
  comparisonModelIds: string[];

  // Data caches (keyed by modelId)
  evaluations: Record<string, EvaluationResult>;
  shapData: Record<string, ShapResult>;
  errorAnalysis: Record<string, ErrorAnalysisResult>;

  // LLM content
  insightBanner: { text: string; isLoading: boolean } | null;
  compareNarrative: { text: string; isLoading: boolean } | null;

  // Filters
  nlFilterText: string;
  activePredicates: FilterPredicate[];
  sortField: string;
  sortDirection: 'asc' | 'desc';

  // Actions
  selectModel: (modelId: string | null) => void;
  toggleComparison: (modelId: string) => void;
  clearComparison: () => void;
  fetchEvaluation: (modelId: string) => Promise<void>;
  fetchShap: (modelId: string) => Promise<void>;
  fetchErrorAnalysis: (modelId: string) => Promise<void>;
  fetchInsightBanner: (projectId: string, models: ModelRecord[]) => Promise<void>;
  fetchCompareNarrative: (projectId: string, modelIds: string[]) => Promise<void>;
  setNlFilter: (text: string, predicates: FilterPredicate[]) => void;
  clearFilter: () => void;
  setSort: (field: string, direction: 'asc' | 'desc') => void;
  purgeModelCache: (modelId: string) => void;
}

export const useExperimentsStore = create<ExperimentsState>((set, get) => ({
  // Selection
  selectedModelId: null,
  comparisonModelIds: [],

  // Data caches
  evaluations: {},
  shapData: {},
  errorAnalysis: {},

  // LLM content
  insightBanner: null,
  compareNarrative: null,

  // Filters
  nlFilterText: '',
  activePredicates: [],
  sortField: 'createdAt',
  sortDirection: 'desc',

  // ── Actions ──

  selectModel: (modelId) => {
    set({ selectedModelId: modelId });
  },

  toggleComparison: (modelId) => {
    const current = get().comparisonModelIds;
    if (current.includes(modelId)) {
      set({ comparisonModelIds: current.filter((id) => id !== modelId) });
    } else {
      if (current.length >= 5) {
        toast.warning('Maximum 5 models can be compared');
        return;
      }
      set({ comparisonModelIds: [...current, modelId] });
    }
  },

  clearComparison: () => {
    set({ comparisonModelIds: [] });
  },

  fetchEvaluation: async (modelId) => {
    if (get().evaluations[modelId]) return;
    try {
      const result = await experimentsApi.fetchEvaluation(modelId);
      set((state) => ({
        evaluations: { ...state.evaluations, [modelId]: result }
      }));
    } catch (error) {
      console.error('[experimentsStore] fetchEvaluation failed:', error);
    }
  },

  fetchShap: async (modelId) => {
    if (get().shapData[modelId]) return;
    try {
      const result = await experimentsApi.fetchShap(modelId);
      set((state) => ({
        shapData: { ...state.shapData, [modelId]: result }
      }));
    } catch (error) {
      console.error('[experimentsStore] fetchShap failed:', error);
    }
  },

  fetchErrorAnalysis: async (modelId) => {
    if (get().errorAnalysis[modelId]) return;
    try {
      const result = await experimentsApi.fetchErrorAnalysis(modelId);
      set((state) => ({
        errorAnalysis: { ...state.errorAnalysis, [modelId]: result }
      }));
    } catch (error) {
      console.error('[experimentsStore] fetchErrorAnalysis failed:', error);
    }
  },

  fetchInsightBanner: async (projectId, models) => {
    set({ insightBanner: { text: '', isLoading: true } });
    try {
      const response = await experimentsApi.fetchInsights(projectId, {
        type: 'banner',
        context: {
          models: models.map((m) => ({
            modelId: m.modelId,
            name: m.name,
            algorithm: m.algorithm,
            taskType: m.taskType,
            metrics: m.metrics,
            status: m.status
          }))
        }
      });
      await accumulateTokenStream(response, (accumulated) => {
        set((state) => ({
          insightBanner: state.insightBanner
            ? { ...state.insightBanner, text: accumulated }
            : null
        }));
      });
      set((state) => ({
        insightBanner: state.insightBanner
          ? { ...state.insightBanner, isLoading: false }
          : null
      }));
    } catch {
      set({ insightBanner: null });
    }
  },

  fetchCompareNarrative: async (projectId, modelIds) => {
    set({ compareNarrative: { text: '', isLoading: true } });
    try {
      const response = await experimentsApi.fetchInsights(projectId, {
        type: 'compare',
        context: { modelIds }
      });
      await accumulateTokenStream(response, (accumulated) => {
        set((state) => ({
          compareNarrative: state.compareNarrative
            ? { ...state.compareNarrative, text: accumulated }
            : null
        }));
      });
      set((state) => ({
        compareNarrative: state.compareNarrative
          ? { ...state.compareNarrative, isLoading: false }
          : null
      }));
    } catch {
      set({ compareNarrative: null });
    }
  },

  setNlFilter: (text, predicates) => {
    set({ nlFilterText: text, activePredicates: predicates });
  },

  clearFilter: () => {
    set({ nlFilterText: '', activePredicates: [] });
  },

  setSort: (field, direction) => {
    set({ sortField: field, sortDirection: direction });
  },

  purgeModelCache: (modelId) => {
    set((state) => {
      const evaluations = { ...state.evaluations };
      const shapData = { ...state.shapData };
      const errorAnalysis = { ...state.errorAnalysis };
      delete evaluations[modelId];
      delete shapData[modelId];
      delete errorAnalysis[modelId];
      return { evaluations, shapData, errorAnalysis };
    });
  }
}));
