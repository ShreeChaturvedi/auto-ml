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

/** Minimum time (ms) between insight banner LLM calls */
const INSIGHT_STALE_TIME = 30_000;

interface ExperimentsState {
  // Selection
  selectedModelId: string | null;
  comparisonModelIds: string[];

  // Data caches (keyed by modelId; null means fetched but unavailable)
  evaluations: Record<string, EvaluationResult | null>;
  shapData: Record<string, ShapResult | null>;
  errorAnalysis: Record<string, ErrorAnalysisResult | null>;

  // LLM content
  projectInsight: { text: string; isLoading: boolean } | null;
  insightModelHash: string | null;
  insightFetchedAt: number;
  compareNarrative: { text: string; isLoading: boolean } | null;
  reportContent: { text: string; isLoading: boolean } | null;
  reportModelHash: string | null;
  reportFetchedAt: number;

  // View switching
  experimentView: 'overview' | 'leaderboard';

  // Detail dialog tab persistence (keyed by modelId)
  activeDetailTab: Record<string, string>;

  // Filters
  nlFilterText: string;
  activePredicates: FilterPredicate[];
  sortField: string;
  sortDirection: 'asc' | 'desc';

  // Actions
  selectModel: (modelId: string | null) => void;
  toggleComparison: (modelId: string) => void;
  clearComparison: () => void;
  setExperimentView: (view: 'overview' | 'leaderboard') => void;
  fetchEvaluation: (modelId: string) => Promise<void>;
  fetchShap: (modelId: string) => Promise<void>;
  fetchErrorAnalysis: (modelId: string) => Promise<void>;
  fetchProjectInsight: (projectId: string, models: ModelRecord[]) => Promise<void>;
  fetchReport: (projectId: string, models: ModelRecord[]) => Promise<void>;
  fetchCompareNarrative: (projectId: string, modelIds: string[], models: ModelRecord[]) => Promise<void>;
  setNlFilter: (text: string, predicates: FilterPredicate[]) => void;
  clearFilter: () => void;
  setSort: (field: string, direction: 'asc' | 'desc') => void;
  setActiveDetailTab: (modelId: string, tab: string) => void;
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
  projectInsight: null,
  insightModelHash: null,
  insightFetchedAt: 0,
  compareNarrative: null,
  reportContent: null,
  reportModelHash: null,
  reportFetchedAt: 0,

  // View switching
  experimentView: 'overview',

  // Detail dialog tab persistence
  activeDetailTab: {},

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

  setExperimentView: (view) => {
    set({ experimentView: view });
  },

  fetchEvaluation: async (modelId) => {
    if (modelId in get().evaluations) return;
    try {
      const result = await experimentsApi.fetchEvaluation(modelId);
      set((state) => ({
        evaluations: { ...state.evaluations, [modelId]: result }
      }));
    } catch (error) {
      console.error('[experimentsStore] fetchEvaluation failed:', error);
      set((state) => ({
        evaluations: { ...state.evaluations, [modelId]: null }
      }));
    }
  },

  fetchShap: async (modelId) => {
    if (modelId in get().shapData) return;
    try {
      const result = await experimentsApi.fetchShap(modelId);
      set((state) => ({
        shapData: { ...state.shapData, [modelId]: result }
      }));
    } catch {
      set((state) => ({
        shapData: { ...state.shapData, [modelId]: null }
      }));
    }
  },

  fetchErrorAnalysis: async (modelId) => {
    if (modelId in get().errorAnalysis) return;
    try {
      const result = await experimentsApi.fetchErrorAnalysis(modelId);
      // Backend returns { available: false } when error analysis isn't possible
      const resolved = result && 'available' in result && !(result as Record<string, unknown>).available ? null : result;
      set((state) => ({
        errorAnalysis: { ...state.errorAnalysis, [modelId]: resolved }
      }));
    } catch {
      set((state) => ({
        errorAnalysis: { ...state.errorAnalysis, [modelId]: null }
      }));
    }
  },

  fetchProjectInsight: async (projectId, models) => {
    const hash = models.map((m) => m.modelId).sort().join(',');
    const current = get();
    if (hash === current.insightModelHash && current.projectInsight?.text) return;
    if (current.projectInsight?.isLoading) return;
    if (current.insightFetchedAt && Date.now() - current.insightFetchedAt < INSIGHT_STALE_TIME) return;

    set({ projectInsight: { text: '', isLoading: true }, insightModelHash: hash, insightFetchedAt: Date.now() });
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
          projectInsight: state.projectInsight
            ? { ...state.projectInsight, text: accumulated }
            : null
        }));
      });
      set((state) => ({
        projectInsight: state.projectInsight
          ? { ...state.projectInsight, isLoading: false }
          : null
      }));
    } catch {
      set({ projectInsight: null });
    }
  },

  fetchReport: async (projectId, models) => {
    const hash = models.map((m) => m.modelId).sort().join(',');
    const current = get();
    if (hash === current.reportModelHash && current.reportContent?.text) return;
    if (current.reportContent?.isLoading) return;
    if (current.reportFetchedAt && Date.now() - current.reportFetchedAt < INSIGHT_STALE_TIME) return;

    set({ reportContent: { text: '', isLoading: true }, reportModelHash: hash, reportFetchedAt: Date.now() });
    let rafId = 0;
    let latestText = '';
    try {
      const response = await experimentsApi.fetchInsights(projectId, {
        type: 'report',
        context: { models: models.map((m) => ({ modelId: m.modelId })) }
      });
      await accumulateTokenStream(response, (accumulated) => {
        latestText = accumulated;
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            set((state) => ({
              reportContent: state.reportContent
                ? { ...state.reportContent, text: latestText }
                : null
            }));
          });
        }
      });
      // Cancel any trailing rAF before the final flush to avoid a no-op re-render
      if (rafId) cancelAnimationFrame(rafId);
      set((state) => ({
        reportContent: state.reportContent
          ? { text: latestText, isLoading: false }
          : null
      }));
    } catch {
      if (rafId) cancelAnimationFrame(rafId);
      set({ reportContent: null });
    }
  },

  fetchCompareNarrative: async (projectId, modelIds, models) => {
    set({ compareNarrative: { text: '', isLoading: true } });
    try {
      const modelsContext = models
        .filter((m) => modelIds.includes(m.modelId))
        .map((m) => ({
          modelId: m.modelId,
          name: m.name,
          algorithm: m.algorithm,
          taskType: m.taskType,
          metrics: m.metrics,
        }));
      const response = await experimentsApi.fetchInsights(projectId, {
        type: 'compare',
        context: { modelIds, models: modelsContext }
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
    const update: Partial<ExperimentsState> = { nlFilterText: text, activePredicates: predicates };
    if (predicates.length > 0) update.experimentView = 'leaderboard';
    set(update);
  },

  clearFilter: () => {
    set({ nlFilterText: '', activePredicates: [] });
  },

  setSort: (field, direction) => {
    set({ sortField: field, sortDirection: direction });
  },

  setActiveDetailTab: (modelId, tab) => {
    if (get().activeDetailTab[modelId] === tab) return;
    set((state) => ({
      activeDetailTab: { ...state.activeDetailTab, [modelId]: tab }
    }));
  },

  purgeModelCache: (modelId) => {
    set((state) => {
      const evaluations = { ...state.evaluations };
      const shapData = { ...state.shapData };
      const errorAnalysis = { ...state.errorAnalysis };
      const activeDetailTab = { ...state.activeDetailTab };
      delete evaluations[modelId];
      delete shapData[modelId];
      delete errorAnalysis[modelId];
      delete activeDetailTab[modelId];
      return { evaluations, shapData, errorAnalysis, activeDetailTab };
    });
  }
}));
