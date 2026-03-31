import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchEvaluation as apiFetchEvaluation,
  fetchShap as apiFetchShap,
  fetchErrorAnalysis as apiFetchErrorAnalysis,
} from '../../lib/api/experiments';
import type { EvaluationResult } from '../../types/experiments';
import { createInitialExperimentsState, useExperimentsStore } from '../experimentsStore';

vi.mock('../../lib/api/experiments', () => ({
  fetchEvaluation: vi.fn(),
  fetchShap: vi.fn(),
  fetchErrorAnalysis: vi.fn(),
  fetchInsights: vi.fn(),
  parseNlFilter: vi.fn(),
}));

const toastWarning = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { warning: toastWarning } }));

const fetchEvaluationMock = vi.mocked(apiFetchEvaluation);
const fetchShapMock = vi.mocked(apiFetchShap);
const fetchErrorAnalysisMock = vi.mocked(apiFetchErrorAnalysis);

function resetStore() {
  useExperimentsStore.setState(createInitialExperimentsState());
}

const MOCK_EVALUATION: EvaluationResult = {
  taskType: 'classification',
  timestamp: '2026-03-17T00:00:00Z',
  computeMs: 150,
  feature_importance: {
    permutation: {
      features: ['age', 'income'],
      importances_mean: [0.3, 0.7],
      importances_std: [0.01, 0.02]
    }
  },
  learning_curve: {
    train_sizes: [100, 200],
    train_scores_mean: [0.8, 0.85],
    train_scores_std: [0.02, 0.01],
    test_scores_mean: [0.75, 0.82],
    test_scores_std: [0.03, 0.02]
  },
  cross_validation: {
    scores: [0.8, 0.82, 0.79],
    mean: 0.803,
    std: 0.012,
    scoring: 'accuracy'
  }
};

describe('experimentsStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('selectModel() sets selectedModelId', () => {
    useExperimentsStore.getState().selectModel('model-1');
    expect(useExperimentsStore.getState().selectedModelId).toBe('model-1');
  });

  it('selectModel(null) clears selectedModelId', () => {
    useExperimentsStore.getState().selectModel('model-1');
    useExperimentsStore.getState().selectModel(null);
    expect(useExperimentsStore.getState().selectedModelId).toBeNull();
  });

  it('toggleComparison() adds modelId to comparisonModelIds', () => {
    useExperimentsStore.getState().toggleComparison('model-1');
    expect(useExperimentsStore.getState().comparisonModelIds).toEqual(['model-1']);
  });

  it('toggleComparison() removes modelId if already present', () => {
    useExperimentsStore.getState().toggleComparison('model-1');
    useExperimentsStore.getState().toggleComparison('model-1');
    expect(useExperimentsStore.getState().comparisonModelIds).toEqual([]);
  });

  it('toggleComparison() enforces max 5 models and shows toast', () => {
    for (let i = 1; i <= 6; i++) {
      useExperimentsStore.getState().toggleComparison(`model-${i}`);
    }
    expect(useExperimentsStore.getState().comparisonModelIds).toHaveLength(5);
    expect(useExperimentsStore.getState().comparisonModelIds).not.toContain('model-6');
    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining('5'));
  });

  it('clearComparison() empties comparisonModelIds', () => {
    useExperimentsStore.getState().toggleComparison('model-1');
    useExperimentsStore.getState().toggleComparison('model-2');
    useExperimentsStore.getState().clearComparison();
    expect(useExperimentsStore.getState().comparisonModelIds).toEqual([]);
  });

  it('setSort() updates sortField and sortDirection', () => {
    useExperimentsStore.getState().setSort('accuracy', 'asc');
    const state = useExperimentsStore.getState();
    expect(state.sortField).toBe('accuracy');
    expect(state.sortDirection).toBe('asc');
  });

  it('fetchEvaluation() calls API and stores result in evaluations cache', async () => {
    fetchEvaluationMock.mockResolvedValue(MOCK_EVALUATION);

    await useExperimentsStore.getState().fetchEvaluation('model-1');

    expect(fetchEvaluationMock).toHaveBeenCalledWith('model-1');
    expect(useExperimentsStore.getState().evaluations['model-1']).toEqual(MOCK_EVALUATION);
  });

  it('fetchEvaluation() does not re-fetch if already cached', async () => {
    fetchEvaluationMock.mockResolvedValue(MOCK_EVALUATION);

    await useExperimentsStore.getState().fetchEvaluation('model-1');
    await useExperimentsStore.getState().fetchEvaluation('model-1');

    expect(fetchEvaluationMock).toHaveBeenCalledTimes(1);
  });

  it('fetchEvaluation() sets null on API failure instead of leaving undefined', async () => {
    fetchEvaluationMock.mockRejectedValue(new Error('404'));

    await useExperimentsStore.getState().fetchEvaluation('model-1');

    expect(useExperimentsStore.getState().evaluations['model-1']).toBeNull();
  });

  it('fetchEvaluation() does not re-fetch after failure (null cached)', async () => {
    fetchEvaluationMock.mockRejectedValue(new Error('404'));

    await useExperimentsStore.getState().fetchEvaluation('model-1');
    await useExperimentsStore.getState().fetchEvaluation('model-1');

    expect(fetchEvaluationMock).toHaveBeenCalledTimes(1);
  });

  it('fetchShap() sets null on 404 to prevent infinite loading', async () => {
    fetchShapMock.mockRejectedValue(new Error('Not found'));

    await useExperimentsStore.getState().fetchShap('model-1');

    expect(useExperimentsStore.getState().shapData['model-1']).toBeNull();
  });

  it('fetchShap() does not re-fetch after 404 (null cached)', async () => {
    fetchShapMock.mockRejectedValue(new Error('Not found'));

    await useExperimentsStore.getState().fetchShap('model-1');
    await useExperimentsStore.getState().fetchShap('model-1');

    expect(fetchShapMock).toHaveBeenCalledTimes(1);
  });

  it('fetchErrorAnalysis() sets null on 404 to prevent infinite loading', async () => {
    fetchErrorAnalysisMock.mockRejectedValue(new Error('Not found'));

    await useExperimentsStore.getState().fetchErrorAnalysis('model-1');

    expect(useExperimentsStore.getState().errorAnalysis['model-1']).toBeNull();
  });

  it('fetchErrorAnalysis() does not re-fetch after 404 (null cached)', async () => {
    fetchErrorAnalysisMock.mockRejectedValue(new Error('Not found'));

    await useExperimentsStore.getState().fetchErrorAnalysis('model-1');
    await useExperimentsStore.getState().fetchErrorAnalysis('model-1');

    expect(fetchErrorAnalysisMock).toHaveBeenCalledTimes(1);
  });

  it('purgeModelCache() resets to undefined so data can be re-fetched', async () => {
    fetchEvaluationMock.mockRejectedValue(new Error('404'));
    await useExperimentsStore.getState().fetchEvaluation('model-1');
    expect(useExperimentsStore.getState().evaluations['model-1']).toBeNull();

    useExperimentsStore.getState().purgeModelCache('model-1');
    expect(useExperimentsStore.getState().evaluations['model-1']).toBeUndefined();

    // After purge, should re-fetch
    fetchEvaluationMock.mockResolvedValue(MOCK_EVALUATION);
    await useExperimentsStore.getState().fetchEvaluation('model-1');
    expect(fetchEvaluationMock).toHaveBeenCalledTimes(2);
    expect(useExperimentsStore.getState().evaluations['model-1']).toEqual(MOCK_EVALUATION);
  });

  it('retryEvaluation() purges cached failures before re-fetching', async () => {
    fetchEvaluationMock.mockRejectedValueOnce(new Error('404'));
    await useExperimentsStore.getState().fetchEvaluation('model-1');
    expect(useExperimentsStore.getState().evaluations['model-1']).toBeNull();

    fetchEvaluationMock.mockResolvedValueOnce(MOCK_EVALUATION);
    await useExperimentsStore.getState().retryEvaluation('model-1');

    expect(fetchEvaluationMock).toHaveBeenCalledTimes(2);
    expect(useExperimentsStore.getState().evaluations['model-1']).toEqual(MOCK_EVALUATION);
  });

  it('setExperimentView() updates experimentView', () => {
    expect(useExperimentsStore.getState().experimentView).toBe('overview');
    useExperimentsStore.getState().setExperimentView('leaderboard');
    expect(useExperimentsStore.getState().experimentView).toBe('leaderboard');
  });

  it('setNlFilter() auto-switches to leaderboard when predicates are non-empty', () => {
    expect(useExperimentsStore.getState().experimentView).toBe('overview');
    useExperimentsStore.getState().setNlFilter('accuracy > 0.9', [
      { field: 'accuracy', operator: 'gt', value: '0.9' }
    ]);
    expect(useExperimentsStore.getState().experimentView).toBe('leaderboard');
    expect(useExperimentsStore.getState().activePredicates).toHaveLength(1);
  });

  it('setNlFilter() does not switch view when predicates are empty', () => {
    useExperimentsStore.getState().setExperimentView('overview');
    useExperimentsStore.getState().setNlFilter('', []);
    expect(useExperimentsStore.getState().experimentView).toBe('overview');
  });

  it('startComparison() sets comparisonRequested when >= 2 models selected', () => {
    useExperimentsStore.getState().toggleComparison('model-1');
    useExperimentsStore.getState().toggleComparison('model-2');
    useExperimentsStore.getState().startComparison();
    expect(useExperimentsStore.getState().comparisonRequested).toBe(true);
    expect(useExperimentsStore.getState().compareNarrative).toBeNull();
  });

  it('startComparison() does nothing when < 2 models selected', () => {
    useExperimentsStore.getState().toggleComparison('model-1');
    useExperimentsStore.getState().startComparison();
    expect(useExperimentsStore.getState().comparisonRequested).toBe(false);
  });

  it('stopComparison() preserves selections', () => {
    useExperimentsStore.getState().toggleComparison('model-1');
    useExperimentsStore.getState().toggleComparison('model-2');
    useExperimentsStore.getState().startComparison();
    useExperimentsStore.getState().stopComparison();
    expect(useExperimentsStore.getState().comparisonRequested).toBe(false);
    expect(useExperimentsStore.getState().comparisonModelIds).toEqual(['model-1', 'model-2']);
  });

  it('clearComparison() also clears comparisonRequested', () => {
    useExperimentsStore.getState().toggleComparison('model-1');
    useExperimentsStore.getState().toggleComparison('model-2');
    useExperimentsStore.getState().startComparison();
    useExperimentsStore.getState().clearComparison();
    expect(useExperimentsStore.getState().comparisonRequested).toBe(false);
    expect(useExperimentsStore.getState().comparisonModelIds).toEqual([]);
  });

  it('toggleComparison() auto-clears comparisonRequested when < 2 remain', () => {
    useExperimentsStore.getState().toggleComparison('model-1');
    useExperimentsStore.getState().toggleComparison('model-2');
    useExperimentsStore.getState().startComparison();
    useExperimentsStore.getState().toggleComparison('model-2');
    expect(useExperimentsStore.getState().comparisonRequested).toBe(false);
  });

  it('manual predicates CRUD works correctly', () => {
    const pred = { field: 'taskType', operator: 'eq' as const, value: 'classification' };
    useExperimentsStore.getState().addManualPredicate(pred);
    expect(useExperimentsStore.getState().manualPredicates).toEqual([pred]);

    useExperimentsStore.getState().removeManualPredicate(0);
    expect(useExperimentsStore.getState().manualPredicates).toEqual([]);
  });

  it('setManualPredicates() replaces all predicates', () => {
    const preds = [
      { field: 'taskType', operator: 'eq' as const, value: 'classification' },
      { field: 'accuracy', operator: 'gte' as const, value: 0.9 },
    ];
    useExperimentsStore.getState().setManualPredicates(preds);
    expect(useExperimentsStore.getState().manualPredicates).toEqual(preds);
  });

  it('clearManualPredicates() empties the array', () => {
    useExperimentsStore.getState().addManualPredicate({ field: 'taskType', operator: 'eq' as const, value: 'classification' });
    useExperimentsStore.getState().clearManualPredicates();
    expect(useExperimentsStore.getState().manualPredicates).toEqual([]);
  });

  it('setNameFilter() updates nameFilter', () => {
    useExperimentsStore.getState().setNameFilter('random forest');
    expect(useExperimentsStore.getState().nameFilter).toBe('random forest');
  });

  it('invalidateReport() clears cached report state', () => {
    useExperimentsStore.setState({
      reportContent: { text: 'cached', isLoading: false },
      reportModelHash: 'model-a',
      reportFetchedAt: 123,
    });

    useExperimentsStore.getState().invalidateReport();

    const state = useExperimentsStore.getState();
    expect(state.reportContent).toBeNull();
    expect(state.reportModelHash).toBeNull();
    expect(state.reportFetchedAt).toBe(0);
  });
});
