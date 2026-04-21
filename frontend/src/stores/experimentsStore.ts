import { create } from 'zustand';
import { toast } from 'sonner';

import type {
  ErrorAnalysisResult,
  EvaluationResult,
  ExperimentDetailTab,
  ExperimentSortDirection,
  ExperimentSortField,
  ExperimentView,
  FilterPredicate,
  ShapResult,
} from '@/types/experiments';
import type { ModelRecord } from '@/types/model';
import * as experimentsApi from '@/lib/api/experiments';
import { accumulateTokenStream } from '@/lib/api/streamReader';

const INSIGHT_STALE_TIME = 30_000;
const MAX_CACHED_MODELS = 5;

interface ExperimentsState {
  selectedModelId: string | null;
  comparisonModelIds: string[];
  modelAccessOrder: string[];
  cacheGeneration: number;
  evaluations: Record<string, EvaluationResult | null>;
  shapData: Record<string, ShapResult | null>;
  errorAnalysis: Record<string, ErrorAnalysisResult | null>;
  compareNarrative: { text: string; isLoading: boolean } | null;
  reportContent: { text: string; isLoading: boolean } | null;
  reportModelHash: string | null;
  reportFetchedAt: number;
  experimentView: ExperimentView;
  activeDetailTab: Record<string, ExperimentDetailTab>;
  activePredicates: FilterPredicate[];
  sortField: ExperimentSortField;
  sortDirection: ExperimentSortDirection;
  comparisonRequested: boolean;
  manualPredicates: FilterPredicate[];
  nameFilter: string;
  selectModel: (modelId: string | null) => void;
  toggleComparison: (modelId: string) => void;
  clearComparison: () => void;
  setExperimentView: (view: ExperimentView) => void;
  fetchEvaluation: (modelId: string, force?: boolean, cacheFailure?: boolean) => Promise<void>;
  fetchShap: (modelId: string) => Promise<void>;
  fetchErrorAnalysis: (modelId: string) => Promise<void>;
  fetchReport: (projectId: string, models: ModelRecord[]) => Promise<void>;
  fetchCompareNarrative: (projectId: string, modelIds: string[], models: ModelRecord[]) => Promise<void>;
  setNlFilter: (predicates: FilterPredicate[]) => void;
  clearFilter: () => void;
  setSort: (field: ExperimentSortField, direction: ExperimentSortDirection) => void;
  setActiveDetailTab: (modelId: string, tab: ExperimentDetailTab) => void;
  startComparison: () => void;
  stopComparison: () => void;
  addManualPredicate: (predicate: FilterPredicate) => void;
  removeManualPredicate: (index: number) => void;
  setManualPredicates: (predicates: FilterPredicate[]) => void;
  clearManualPredicates: () => void;
  setNameFilter: (text: string) => void;
  purgeModelCache: (modelId: string) => void;
  retryEvaluation: (modelId: string) => Promise<void>;
  invalidateReport: () => void;
}

type ExperimentsStateData = Pick<
  ExperimentsState,
  | 'selectedModelId'
  | 'comparisonModelIds'
  | 'modelAccessOrder'
  | 'cacheGeneration'
  | 'evaluations'
  | 'shapData'
  | 'errorAnalysis'
  | 'compareNarrative'
  | 'reportContent'
  | 'reportModelHash'
  | 'reportFetchedAt'
  | 'experimentView'
  | 'activeDetailTab'
  | 'activePredicates'
  | 'sortField'
  | 'sortDirection'
  | 'comparisonRequested'
  | 'manualPredicates'
  | 'nameFilter'
>;

export function createInitialExperimentsState(): ExperimentsStateData {
  return {
    selectedModelId: null,
    comparisonModelIds: [],
    modelAccessOrder: [],
    cacheGeneration: 0,
    evaluations: {},
    shapData: {},
    errorAnalysis: {},
    compareNarrative: null,
    reportContent: null,
    reportModelHash: null,
    reportFetchedAt: 0,
    experimentView: 'overview',
    activeDetailTab: {},
    activePredicates: [],
    sortField: 'createdAt',
    sortDirection: 'desc',
    comparisonRequested: false,
    manualPredicates: [],
    nameFilter: '',
  };
}

function clearModelCacheEntry<T>(cache: Record<string, T>, modelId: string): Record<string, T> {
  if (!(modelId in cache)) {
    return cache;
  }
  const next = { ...cache };
  delete next[modelId];
  return next;
}

export const useExperimentsStore = create<ExperimentsState>((set, get) => ({
  ...createInitialExperimentsState(),

  selectModel: (modelId) => {
    if (modelId === null) {
      set({ selectedModelId: null });
      return;
    }
    set((state) => {
      // Dedup + push to back (most recently used)
      const order = [...state.modelAccessOrder.filter((id) => id !== modelId), modelId];

      if (order.length <= MAX_CACHED_MODELS) {
        return { selectedModelId: modelId, modelAccessOrder: order };
      }

      // Determine eviction candidates: oldest entries beyond limit, skip pinned comparison models
      const pinned = new Set(state.comparisonModelIds);
      const evictSet = new Set<string>();
      let i = 0;
      while (order.length - evictSet.size > MAX_CACHED_MODELS && i < order.length - 1) {
        const candidate = order[i];
        if (!pinned.has(candidate)) {
          evictSet.add(candidate);
        }
        i++;
      }

      const pruned = order.filter((id) => !evictSet.has(id));

      const nextEvaluations = { ...state.evaluations };
      const nextShapData = { ...state.shapData };
      const nextErrorAnalysis = { ...state.errorAnalysis };
      const nextActiveDetailTab = { ...state.activeDetailTab };
      for (const id of evictSet) {
        delete nextEvaluations[id];
        delete nextShapData[id];
        delete nextErrorAnalysis[id];
        delete nextActiveDetailTab[id];
      }

      return {
        selectedModelId: modelId,
        modelAccessOrder: pruned,
        cacheGeneration: state.cacheGeneration + 1,
        evaluations: nextEvaluations,
        shapData: nextShapData,
        errorAnalysis: nextErrorAnalysis,
        activeDetailTab: nextActiveDetailTab,
      };
    });
  },

  toggleComparison: (modelId) => {
    const current = get().comparisonModelIds;
    if (current.includes(modelId)) {
      const next = current.filter((id) => id !== modelId);
      set({
        comparisonModelIds: next,
        ...(next.length < 2 ? { comparisonRequested: false } : {}),
      });
      return;
    }

    if (current.length >= 5) {
      toast.warning('Maximum 5 models can be compared');
      return;
    }

    set({ comparisonModelIds: [...current, modelId] });
  },

  clearComparison: () => {
    set({ comparisonModelIds: [], comparisonRequested: false });
  },

  startComparison: () => {
    if (get().comparisonModelIds.length >= 2) {
      set({ comparisonRequested: true, compareNarrative: null });
    }
  },

  stopComparison: () => {
    set({ comparisonRequested: false });
  },

  addManualPredicate: (predicate) => {
    set((state) => ({ manualPredicates: [...state.manualPredicates, predicate] }));
  },

  removeManualPredicate: (index) => {
    set((state) => ({
      manualPredicates: state.manualPredicates.filter((_, currentIndex) => currentIndex !== index),
    }));
  },

  setManualPredicates: (predicates) => {
    set({ manualPredicates: predicates });
  },

  clearManualPredicates: () => {
    set({ manualPredicates: [] });
  },

  setNameFilter: (text) => {
    set({ nameFilter: text });
  },

  setExperimentView: (view) => {
    set({ experimentView: view });
  },

  fetchEvaluation: async (modelId, force = false, cacheFailure = true) => {
    if (!force && modelId in get().evaluations) return;
    const gen = get().cacheGeneration;
    try {
      const result = await experimentsApi.fetchEvaluation(modelId);
      if (get().cacheGeneration !== gen) return;
      if (result === undefined) {
        return;
      }
      set((state) => ({
        evaluations: { ...state.evaluations, [modelId]: result },
      }));
    } catch (error) {
      console.error('[experimentsStore] fetchEvaluation failed:', error);
      if (get().cacheGeneration !== gen) return;
      if (!cacheFailure) {
        return;
      }
      set((state) => ({
        evaluations: { ...state.evaluations, [modelId]: null },
      }));
    }
  },

  fetchShap: async (modelId) => {
    if (modelId in get().shapData) return;
    const gen = get().cacheGeneration;
    try {
      const result = await experimentsApi.fetchShap(modelId);
      if (get().cacheGeneration !== gen) return;
      if (result === undefined) {
        set((state) => ({
          shapData: { ...state.shapData, [modelId]: null },
        }));
        return;
      }
      set((state) => ({
        shapData: { ...state.shapData, [modelId]: result },
      }));
    } catch {
      if (get().cacheGeneration !== gen) return;
      set((state) => ({
        shapData: { ...state.shapData, [modelId]: null },
      }));
    }
  },

  fetchErrorAnalysis: async (modelId) => {
    if (modelId in get().errorAnalysis) return;
    const gen = get().cacheGeneration;
    try {
      const result = await experimentsApi.fetchErrorAnalysis(modelId);
      if (get().cacheGeneration !== gen) return;
      if (result === undefined) {
        set((state) => ({
          errorAnalysis: { ...state.errorAnalysis, [modelId]: null },
        }));
        return;
      }
      const resolved = result?.available === false ? null : result;
      set((state) => ({
        errorAnalysis: { ...state.errorAnalysis, [modelId]: resolved },
      }));
    } catch {
      if (get().cacheGeneration !== gen) return;
      set((state) => ({
        errorAnalysis: { ...state.errorAnalysis, [modelId]: null },
      }));
    }
  },

  fetchReport: async (projectId, models) => {
    const hash = models.map((model) => model.modelId).sort().join(',');
    const current = get();
    if (hash === current.reportModelHash && current.reportContent?.text) return;
    if (current.reportContent?.isLoading) return;
    if (current.reportFetchedAt && Date.now() - current.reportFetchedAt < INSIGHT_STALE_TIME) return;

    const gen = get().cacheGeneration;
    set({
      reportContent: { text: '', isLoading: true },
      reportModelHash: hash,
      reportFetchedAt: Date.now(),
    });

    let rafId = 0;
    let latestText = '';
    try {
      const response = await experimentsApi.fetchInsights(projectId, {
        type: 'report',
        context: { models: models.map((model) => ({ modelId: model.modelId })) },
      });
      await accumulateTokenStream(response, (accumulated) => {
        if (get().cacheGeneration !== gen) return;
        latestText = accumulated;
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            if (get().cacheGeneration !== gen) return;
            set((state) => ({
              reportContent: state.reportContent
                ? { ...state.reportContent, text: latestText }
                : null,
            }));
          });
        }
      });
      if (rafId) cancelAnimationFrame(rafId);
      if (get().cacheGeneration !== gen) return;
      set((state) => ({
        reportContent: state.reportContent ? { text: latestText, isLoading: false } : null,
      }));
    } catch {
      if (rafId) cancelAnimationFrame(rafId);
      if (get().cacheGeneration !== gen) return;
      set({ reportContent: null });
    }
  },

  fetchCompareNarrative: async (projectId, modelIds, models) => {
    const gen = get().cacheGeneration;
    set({ compareNarrative: { text: '', isLoading: true } });
    let rafId = 0;
    let latestText = '';
    try {
      const modelsContext = models
        .filter((model) => modelIds.includes(model.modelId))
        .map((model) => ({
          modelId: model.modelId,
          name: model.name,
          algorithm: model.algorithm,
          taskType: model.taskType,
          metrics: model.metrics,
        }));
      const response = await experimentsApi.fetchInsights(projectId, {
        type: 'compare',
        context: { modelIds, models: modelsContext },
      });
      await accumulateTokenStream(response, (accumulated) => {
        if (get().cacheGeneration !== gen) return;
        latestText = accumulated;
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            if (get().cacheGeneration !== gen) return;
            set((state) => ({
              compareNarrative: state.compareNarrative
                ? { ...state.compareNarrative, text: latestText }
                : null,
            }));
          });
        }
      });
      if (rafId) cancelAnimationFrame(rafId);
      if (get().cacheGeneration !== gen) return;
      set((state) => ({
        compareNarrative: state.compareNarrative
          ? { ...state.compareNarrative, isLoading: false }
          : null,
      }));
    } catch {
      if (rafId) cancelAnimationFrame(rafId);
      if (get().cacheGeneration !== gen) return;
      set({ compareNarrative: null });
    }
  },

  setNlFilter: (predicates) => {
    const update: Partial<ExperimentsState> = { activePredicates: predicates };
    if (predicates.length > 0) {
      update.experimentView = 'leaderboard';
    }
    set(update);
  },

  clearFilter: () => {
    set({ activePredicates: [] });
  },

  setSort: (field, direction) => {
    set({ sortField: field, sortDirection: direction });
  },

  setActiveDetailTab: (modelId, tab) => {
    if (get().activeDetailTab[modelId] === tab) return;
    set((state) => ({
      activeDetailTab: { ...state.activeDetailTab, [modelId]: tab },
    }));
  },

  purgeModelCache: (modelId) => {
    set((state) => ({
      evaluations: clearModelCacheEntry(state.evaluations, modelId),
      shapData: clearModelCacheEntry(state.shapData, modelId),
      errorAnalysis: clearModelCacheEntry(state.errorAnalysis, modelId),
      activeDetailTab: clearModelCacheEntry(state.activeDetailTab, modelId),
      modelAccessOrder: state.modelAccessOrder.filter((id) => id !== modelId),
    }));
  },

  retryEvaluation: async (modelId) => {
    get().purgeModelCache(modelId);
    await experimentsApi.retryEvaluation(modelId);
    await get().fetchEvaluation(modelId, true);
  },

  invalidateReport: () => {
    set({ reportContent: null, reportModelHash: null, reportFetchedAt: 0 });
  },
}));
