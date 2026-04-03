import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureApply } from '../useFeatureApply';

const mockState = vi.hoisted(() => ({
  hydrateFromBackend: vi.fn(),
  applyFeatureEngineering: vi.fn(),
  setSelectedDataset: vi.fn(),
  featureRunId: 'feat-run-1'
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) => selector({
    hydrateFromBackend: mockState.hydrateFromBackend
  })
}));

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: (selector: (state: unknown) => unknown) => selector({
    featureRunId: mockState.featureRunId
  })
}));

vi.mock('@/lib/api/featureEngineering', () => ({
  applyFeatureEngineering: (...args: unknown[]) => mockState.applyFeatureEngineering(...args)
}));

describe('useFeatureApply', () => {
  beforeEach(() => {
    mockState.hydrateFromBackend.mockReset();
    mockState.applyFeatureEngineering.mockReset();
    mockState.setSelectedDataset.mockReset();
    mockState.featureRunId = 'feat-run-1';
    mockState.applyFeatureEngineering.mockResolvedValue({
      dataset: {
        datasetId: 'derived-1',
        filename: 'employees_features.csv'
      }
    });
  });

  it('passes the feature run id and notebook id into apply requests', async () => {
    const { result } = renderHook(() => useFeatureApply({
      projectId: 'project-1',
      notebookId: 'notebook-1',
      projectFeatures: [{
        id: 'feat-salary-scale',
        projectId: 'project-1',
        sourceColumn: 'salary',
        featureName: 'salary_scaled',
        description: 'Scale salary',
        method: 'standardize',
        category: 'scaling',
        params: {},
        enabled: true,
        createdAt: new Date().toISOString()
      }],
      selectedDatasetFile: {
        id: 'file-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['salary']
        }
      },
      setSelectedDataset: mockState.setSelectedDataset
    }));

    await act(async () => {
      await result.current.handleApplyFeatures();
    });

    expect(mockState.applyFeatureEngineering).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      runId: 'feat-run-1',
      notebookId: 'notebook-1'
    }));
  });
});
