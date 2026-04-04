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

  it('surfaces backend apply warnings without failing the apply flow', async () => {
    mockState.applyFeatureEngineering.mockResolvedValueOnce({
      dataset: {
        datasetId: 'derived-2',
        filename: 'employees_features.xlsx'
      },
      warning: 'Dataset was created, but database indexing failed.'
    });

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

    expect(result.current.applyStatus).toBe('success');
    expect(result.current.applyMessage).toContain('Created employees_features.xlsx');
    expect(result.current.applyMessage).toContain('database indexing failed');
    expect(mockState.setSelectedDataset).toHaveBeenCalledWith('derived-2');
  });

  it('allows ratio features without secondaryColumn when feature.code is present (Department Usage Share regression)', async () => {
    const { result } = renderHook(() => useFeatureApply({
      projectId: 'project-1',
      notebookId: 'notebook-1',
      projectFeatures: [{
        id: 'feat-dept-usage',
        projectId: 'project-1',
        sourceColumn: 'CF EE Division',
        // NO secondaryColumn — would normally trigger "needs a secondary column" guard
        featureName: 'Department Usage Share',
        description: 'Group share',
        method: 'ratio',
        category: 'interaction',
        params: {},
        enabled: true,
        createdAt: new Date().toISOString(),
        // LLM-authored code present — guard should be relaxed
        code: "df['department_usage_share'] = df.groupby('CF EE Division')['usage_count'].transform(lambda x: x / x.sum())"
      }],
      selectedDatasetFile: {
        id: 'file-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['CF EE Division', 'usage_count']
        }
      },
      setSelectedDataset: mockState.setSelectedDataset
    }));

    await act(async () => {
      await result.current.handleApplyFeatures();
    });

    // Apply should SUCCEED, not fail with validation error
    expect(result.current.applyStatus).not.toBe('error');
    expect(mockState.applyFeatureEngineering).toHaveBeenCalled();
  });

  it('sends feature.code in the apply POST body', async () => {
    const llmCode = "df['department_usage_share'] = df.groupby('CF EE Division')['usage_count'].transform(lambda x: x / x.sum())";
    const { result } = renderHook(() => useFeatureApply({
      projectId: 'project-1',
      notebookId: 'notebook-1',
      projectFeatures: [{
        id: 'feat-dept-usage',
        projectId: 'project-1',
        sourceColumn: 'CF EE Division',
        featureName: 'Department Usage Share',
        description: 'Group share',
        method: 'ratio',
        category: 'interaction',
        params: {},
        enabled: true,
        createdAt: new Date().toISOString(),
        code: llmCode
      }],
      selectedDatasetFile: {
        id: 'file-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['CF EE Division', 'usage_count']
        }
      },
      setSelectedDataset: mockState.setSelectedDataset
    }));

    await act(async () => {
      await result.current.handleApplyFeatures();
    });

    expect(mockState.applyFeatureEngineering).toHaveBeenCalledWith(expect.objectContaining({
      features: expect.arrayContaining([
        expect.objectContaining({ id: 'feat-dept-usage', code: llmCode })
      ])
    }));
  });

  it('allows target_encode features without params.targetColumn when feature.code is present', async () => {
    const { result } = renderHook(() => useFeatureApply({
      projectId: 'project-1',
      notebookId: 'notebook-1',
      projectFeatures: [{
        id: 'feat-target-encode',
        projectId: 'project-1',
        sourceColumn: 'category',
        featureName: 'category_target_encoded',
        description: 'Target encoded category',
        method: 'target_encode',
        category: 'encoding',
        params: {}, // NO targetColumn — would normally fail
        enabled: true,
        createdAt: new Date().toISOString(),
        code: "df['category_target_encoded'] = df.groupby('category')['target'].transform('mean')"
      }],
      selectedDatasetFile: {
        id: 'file-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['category', 'target']
        }
      },
      setSelectedDataset: mockState.setSelectedDataset
    }));

    await act(async () => {
      await result.current.handleApplyFeatures();
    });

    expect(result.current.applyStatus).not.toBe('error');
    expect(mockState.applyFeatureEngineering).toHaveBeenCalled();
  });

  it('still rejects interaction features WITHOUT code if secondaryColumn is missing (backward compat)', async () => {
    const { result } = renderHook(() => useFeatureApply({
      projectId: 'project-1',
      notebookId: 'notebook-1',
      projectFeatures: [{
        id: 'feat-broken-ratio',
        projectId: 'project-1',
        sourceColumn: 'a',
        // NO secondaryColumn, NO code — should fail the guard
        featureName: 'broken_ratio',
        description: 'Missing secondary column',
        method: 'ratio',
        category: 'interaction',
        params: {},
        enabled: true,
        createdAt: new Date().toISOString()
      }],
      selectedDatasetFile: {
        id: 'file-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['a']
        }
      },
      setSelectedDataset: mockState.setSelectedDataset
    }));

    await act(async () => {
      await result.current.handleApplyFeatures();
    });

    expect(result.current.applyStatus).toBe('error');
    expect(result.current.applyMessage).toContain('secondary column');
    expect(mockState.applyFeatureEngineering).not.toHaveBeenCalled();
  });
});
