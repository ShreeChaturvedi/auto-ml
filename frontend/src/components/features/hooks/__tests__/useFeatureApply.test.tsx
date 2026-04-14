import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/client';
import type { FeatureSpec } from '@/types/feature';

import { useFeatureApply } from '../useFeatureApply';

const mockState = vi.hoisted(() => ({
  hydrateFromBackend: vi.fn(),
  applyFeatureEngineering: vi.fn(),
  setSelectedDataset: vi.fn(),
  featureRunId: 'feat-run-1',
  // The handler reads the latest features via useFeatureStore.getState() to
  // avoid stale prop closures during the register_feature → Apply race. The
  // mock `featureStore` lives inside this hoisted container so each test can
  // mutate `storeFeatures` / `storeFeatureSteps` between render and click to
  // simulate the race (adapter upserts features into the store, but the
  // component hasn't re-rendered yet so the prop closure is still the old
  // pre-register snapshot).
  storeFeatures: [] as Array<Record<string, unknown>>,
  storeFeatureSteps: {} as Record<string, Record<string, unknown>>
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) => selector({
    hydrateFromBackend: mockState.hydrateFromBackend
  })
}));

vi.mock('@/stores/featureStore', () => {
  const buildState = () => ({
    featureRunId: mockState.featureRunId,
    features: mockState.storeFeatures,
    featureSteps: mockState.storeFeatureSteps
  });
  const useFeatureStore = Object.assign(
    (selector: (state: unknown) => unknown) => selector(buildState()),
    { getState: () => buildState() }
  );
  return { useFeatureStore };
});

vi.mock('@/lib/api/featureEngineering', () => ({
  applyFeatureEngineering: (...args: unknown[]) => mockState.applyFeatureEngineering(...args)
}));

describe('useFeatureApply', () => {
  beforeEach(() => {
    mockState.hydrateFromBackend.mockReset();
    mockState.applyFeatureEngineering.mockReset();
    mockState.setSelectedDataset.mockReset();
    mockState.featureRunId = 'feat-run-1';
    mockState.storeFeatures = [];
    mockState.storeFeatureSteps = {};
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

  it('shows backend apply errors without the low-level request prefix', async () => {
    const backendMessage = 'Feature engineering produced no new columns in feature_v1.csv. Applied 3 feature(s) ["Feature adoption missing indicator", "Export share of usage", "Event month seasonality"] but the output schema matches the source exactly.';
    mockState.applyFeatureEngineering.mockRejectedValueOnce(
      new ApiError(
        `Request to http://localhost:4000/api/feature-engineering/apply failed with status 400: ${backendMessage.slice(0, 80)}…`,
        400,
        { error: backendMessage }
      )
    );

    const { result } = renderHook(() => useFeatureApply({
      projectId: 'project-1',
      notebookId: 'notebook-1',
      projectFeatures: [{
        id: 'feat-existing',
        projectId: 'project-1',
        sourceColumn: 'usage_count',
        featureName: 'usage_count_log1p',
        description: 'Already-applied feature',
        method: 'log1p_transform',
        category: 'numeric_transform',
        params: {},
        enabled: true,
        createdAt: new Date().toISOString(),
        code: "df['usage_count_log1p'] = np.log1p(df['usage_count'])"
      }],
      selectedDatasetFile: {
        id: 'file-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['usage_count', 'usage_count_log1p']
        }
      },
      setSelectedDataset: mockState.setSelectedDataset
    }));

    await act(async () => {
      await result.current.handleApplyFeatures();
    });

    expect(result.current.applyStatus).toBe('error');
    expect(result.current.applyMessage).toBe(backendMessage);
    expect(result.current.applyMessage).not.toContain('Request to http://localhost');
  });

  it('surfaces a success message when apply creates a dataset', async () => {
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
    expect(result.current.applyMessage).toContain('Created employees_features.csv');
    expect(mockState.setSelectedDataset).toHaveBeenCalledWith('derived-1');
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

  describe('race-free apply payload construction', () => {
    // Regression: when the user clicks Apply immediately after the FE lifecycle
    // runs, React hasn't yet committed the re-render that would rebuild the
    // useCallback with the new `projectFeatures` prop. The Zustand store DOES
    // have the post-register state (updated synchronously by the adapter's
    // upsertFeature call from a WS event handler that runs outside React's
    // batching). The hook must read via useFeatureStore.getState() at click
    // time so the payload reflects the latest store, not the stale closure.

    it('prefers the fresh Zustand store over a stale prop closure (race simulation)', async () => {
      const llmCode = "df['salary_log1p'] = np.log1p(df['salary'])";
      const staleFeature: FeatureSpec = {
        id: 'feat-race',
        projectId: 'project-1',
        sourceColumn: 'salary',
        featureName: 'salary_log1p',
        description: 'log1p of salary',
        method: 'log1p_transform',
        category: 'numeric_transform',
        params: {},
        enabled: true,
        createdAt: new Date().toISOString()
        // No `code` — this is the pre-register snapshot.
      };
      // Both the store and the prop start as the pre-register snapshot,
      // matching production (both sourced from the same Zustand state).
      mockState.storeFeatures = [staleFeature as unknown as Record<string, unknown>];

      const { result } = renderHook(() => useFeatureApply({
        projectId: 'project-1',
        notebookId: 'notebook-1',
        projectFeatures: [staleFeature],
        selectedDatasetFile: {
          id: 'file-1',
          metadata: { datasetId: 'dataset-1', columns: ['salary'] }
        },
        setSelectedDataset: mockState.setSelectedDataset
      }));

      // THE RACE: adapter's onResult for register_feature runs (outside React
      // dispatch), upserts the fresh feature with code into the store. React
      // will eventually commit and rebuild the useCallback, but before that
      // happens the user clicks Apply. The click handler's closure still
      // references the old prop. Without the getState() fix, the payload
      // would have the stale empty code.
      mockState.storeFeatures = [{ ...staleFeature, code: llmCode }];
      // NOTE: no rerender() — the point is that the callback's prop closure
      // has NOT been refreshed yet.

      await act(async () => {
        await result.current.handleApplyFeatures();
      });

      expect(mockState.applyFeatureEngineering).toHaveBeenCalledWith(expect.objectContaining({
        features: expect.arrayContaining([
          expect.objectContaining({ id: 'feat-race', code: llmCode })
        ])
      }));
    });

    it('falls back to featureSteps[id].code on reload/bridge-miss when the feature spec is missing code', async () => {
      // Real-world scenario this guards against: on page reload, features are
      // hydrated from project metadata via hydrateFromProject. If the metadata
      // was written during a pre-fix session (or sync was interrupted before
      // feature.code was persisted), the features array lacks code — but the
      // backend feature pipeline run still has the authoritative code, and
      // the adapter's run-hydration path back-fills it into featureSteps.
      // This test guarantees the fallback path hydrates code from featureSteps
      // so the apply payload is still correct after a reload.
      const llmCode = "df['tenure_bucket'] = pd.cut(df['years'], bins=[0,2,5,10], labels=['a','b','c'])";
      mockState.storeFeatures = [{
        id: 'feat-bridge-miss',
        projectId: 'project-1',
        sourceColumn: 'years',
        featureName: 'tenure_bucket',
        description: 'Tenure buckets',
        method: 'bucketize',
        category: 'numeric_transform',
        params: {},
        enabled: true,
        createdAt: new Date().toISOString()
        // No code on the feature spec
      }];
      mockState.storeFeatureSteps = {
        'feat-bridge-miss': {
          stepId: 'feat-bridge-miss',
          name: 'tenure_bucket',
          method: 'bucketize',
          status: 'registered',
          code: llmCode
        }
      };

      const { result } = renderHook(() => useFeatureApply({
        projectId: 'project-1',
        notebookId: 'notebook-1',
        projectFeatures: [],
        selectedDatasetFile: {
          id: 'file-1',
          metadata: { datasetId: 'dataset-1', columns: ['years'] }
        },
        setSelectedDataset: mockState.setSelectedDataset
      }));

      await act(async () => {
        await result.current.handleApplyFeatures();
      });

      expect(mockState.applyFeatureEngineering).toHaveBeenCalledWith(expect.objectContaining({
        features: expect.arrayContaining([
          expect.objectContaining({ id: 'feat-bridge-miss', code: llmCode })
        ])
      }));
    });

    it('leaves code undefined when neither the store nor featureSteps has it (template fallback path)', async () => {
      // Legitimate path: user toggled a template-based suggestion that never
      // went through materialize_feature_code. Backend will use its codegen
      // template. No regression on this path.
      mockState.storeFeatures = [{
        id: 'feat-template',
        projectId: 'project-1',
        sourceColumn: 'salary',
        featureName: 'salary_scaled',
        description: 'Template-generated',
        method: 'standardize',
        category: 'scaling',
        params: {},
        enabled: true,
        createdAt: new Date().toISOString()
      }];

      const { result } = renderHook(() => useFeatureApply({
        projectId: 'project-1',
        notebookId: 'notebook-1',
        projectFeatures: [],
        selectedDatasetFile: {
          id: 'file-1',
          metadata: { datasetId: 'dataset-1', columns: ['salary'] }
        },
        setSelectedDataset: mockState.setSelectedDataset
      }));

      await act(async () => {
        await result.current.handleApplyFeatures();
      });

      const call = mockState.applyFeatureEngineering.mock.calls[0][0] as { features: Array<{ code?: string }> };
      expect(call.features).toHaveLength(1);
      expect(call.features[0].code).toBeUndefined();
    });
  });

  it('ignores enabled features from another draft when applying the current draft', async () => {
    mockState.storeFeatures = [{
      id: 'feat-old-draft',
      projectId: 'project-1',
      versionId: 'draft-1',
      sourceColumn: 'device_type',
      featureName: 'device_type_encoded',
      description: 'Old draft feature',
      method: 'one_hot_encode',
      category: 'encoding',
      params: {},
      enabled: true,
      createdAt: new Date().toISOString()
    }];

    const { result } = renderHook(() => useFeatureApply({
      projectId: 'project-1',
      currentVersionId: 'draft-2',
      notebookId: 'notebook-2',
      projectFeatures: [],
      selectedDatasetFile: {
        id: 'file-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['device_type']
        }
      },
      setSelectedDataset: mockState.setSelectedDataset
    }));

    await act(async () => {
      await result.current.handleApplyFeatures();
    });

    expect(result.current.applyStatus).toBe('error');
    expect(result.current.applyMessage).toBe('Select at least one feature.');
    expect(mockState.applyFeatureEngineering).not.toHaveBeenCalled();
  });

  it('keeps the current draft feature state usable after a successful apply', async () => {
    mockState.storeFeatures = [{
      id: 'feat-current-draft',
      projectId: 'project-1',
      versionId: 'draft-1',
      sourceColumn: 'device_type',
      featureName: 'device_type_encoded',
      description: 'Current draft feature',
      method: 'one_hot_encode',
      category: 'encoding',
      params: {},
      enabled: true,
      createdAt: new Date().toISOString(),
      code: "df['device_type_encoded'] = (df['device_type'] == 'mobile').astype('int8')"
    }];

    mockState.applyFeatureEngineering
      .mockResolvedValueOnce({
        dataset: {
          datasetId: 'derived-1',
          filename: 'draft1_features_v1.csv'
        }
      })
      .mockResolvedValueOnce({
        dataset: {
          datasetId: 'derived-2',
          filename: 'draft1_features_v2.csv'
        }
      });

    const { result } = renderHook(() => useFeatureApply({
      projectId: 'project-1',
      currentVersionId: 'draft-1',
      notebookId: 'notebook-1',
      projectFeatures: [],
      selectedDatasetFile: {
        id: 'file-1',
        metadata: {
          datasetId: 'dataset-1',
          columns: ['device_type']
        }
      },
      setSelectedDataset: mockState.setSelectedDataset
    }));

    await act(async () => {
      await result.current.handleApplyFeatures();
    });

    await act(async () => {
      await result.current.handleApplyFeatures();
    });

    expect(mockState.applyFeatureEngineering).toHaveBeenCalledTimes(2);
    expect(mockState.applyFeatureEngineering).toHaveBeenNthCalledWith(1, expect.objectContaining({
      notebookId: 'notebook-1',
      features: expect.arrayContaining([
        expect.objectContaining({ id: 'feat-current-draft', versionId: 'draft-1' })
      ])
    }));
    expect(mockState.applyFeatureEngineering).toHaveBeenNthCalledWith(2, expect.objectContaining({
      notebookId: 'notebook-1',
      features: expect.arrayContaining([
        expect.objectContaining({ id: 'feat-current-draft', versionId: 'draft-1' })
      ])
    }));
    expect(mockState.setSelectedDataset).toHaveBeenNthCalledWith(1, 'derived-1');
    expect(mockState.setSelectedDataset).toHaveBeenNthCalledWith(2, 'derived-2');
  });
});
