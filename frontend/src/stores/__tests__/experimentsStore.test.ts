import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchEvaluation as apiFetchEvaluation } from '../../lib/api/experiments';
import type { EvaluationResult } from '../../types/experiments';
import { useExperimentsStore } from '../experimentsStore';

vi.mock('../../lib/api/experiments', () => ({
  fetchEvaluation: vi.fn(),
  fetchShap: vi.fn(),
  fetchErrorAnalysis: vi.fn(),
  compareModels: vi.fn(),
  fetchInsights: vi.fn()
}));

const fetchEvaluationMock = vi.mocked(apiFetchEvaluation);

function resetStore() {
  useExperimentsStore.setState({
    selectedModelId: null,
    comparisonModelIds: [],
    evaluations: {},
    shapData: {},
    errorAnalysis: {},
    insightBanner: null,
    compareNarrative: null,
    nlFilterText: '',
    activePredicates: [],
    sortField: 'createdAt',
    sortDirection: 'desc'
  });
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

  it('toggleComparison() enforces max 5 models', () => {
    for (let i = 1; i <= 6; i++) {
      useExperimentsStore.getState().toggleComparison(`model-${i}`);
    }
    expect(useExperimentsStore.getState().comparisonModelIds).toHaveLength(5);
    expect(useExperimentsStore.getState().comparisonModelIds).not.toContain('model-6');
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
});
