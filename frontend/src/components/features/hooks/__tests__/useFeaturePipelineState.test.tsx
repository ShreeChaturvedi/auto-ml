import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeaturePipelineState } from '../useFeaturePipelineState';

const mockState = vi.hoisted(() => ({
  files: [
    {
      id: 'dataset-1',
      name: 'employees.csv',
      type: 'csv',
      size: 512,
      uploadedAt: new Date('2026-02-24T00:00:00.000Z'),
      projectId: 'p1',
      metadata: {
        datasetId: 'dataset-1',
        columns: ['employee_id', 'salary']
      }
    }
  ],
  hydrateFromBackendMock: vi.fn(),
  hydrateFeaturesMock: vi.fn(),
  setFeatureRunIdMock: vi.fn(),
  setFeatureStepMock: vi.fn(),
  fetchFeatureRunMock: vi.fn(),
  fetchFeatureRunsMock: vi.fn(),
  featureRunIdInStore: null as string | null,
  workflowSession: undefined as { runId?: string } | undefined,
  hydrationError: null as string | null
}));

vi.mock('@/stores/dataStore', () => {
  const useDataStore = Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        files: mockState.files,
        hydrateFromBackend: mockState.hydrateFromBackendMock
      }),
    {
      getState: () => ({
        files: mockState.files,
        hydrationError: mockState.hydrationError
      })
    }
  );

  return { useDataStore };
});

vi.mock('@/stores/featureStore', () => {
  const createFeatureStoreState = () => ({
    features: [],
    versions: { p1: [] },
    currentVersionId: { p1: 'v1' },
    featureSteps: {},
    currentStage: null,
    featureRunId: mockState.featureRunIdInStore,
    hydrateFromProject: mockState.hydrateFeaturesMock,
    setFeatureRunId: mockState.setFeatureRunIdMock,
    setFeatureStep: mockState.setFeatureStepMock
  });

  const useFeatureStore = Object.assign(
    (selector: (state: unknown) => unknown) => selector(createFeatureStoreState()),
    {
      getState: createFeatureStoreState
    }
  );

  return { useFeatureStore };
});

vi.mock('@/stores/workflowSessionStore', () => ({
  buildWorkflowSessionKey: (projectId: string, storageKey: string) => `${projectId}:${storageKey}`,
  useWorkflowSessionStore: {
    getState: () => ({
      getSession: () => mockState.workflowSession
    })
  }
}));

vi.mock('@/lib/api/featureEngineering', () => ({
  fetchFeatureRun: (...args: unknown[]) => mockState.fetchFeatureRunMock(...args),
  fetchFeatureRuns: (...args: unknown[]) => mockState.fetchFeatureRunsMock(...args)
}));

vi.mock('../useFeatureReadiness', () => ({
  useFeatureReadiness: () => ({
    readinessReport: {
      dataSummary: {
        addedColumns: [],
        removedColumns: [],
        renamedColumns: [],
        typeChanges: [],
        nullDeltas: [],
        warnings: []
      },
      steps: []
    },
    isReadyForApproval: false,
    readinessReportUnlocked: false,
    isReadinessExpanded: false,
    setIsReadinessExpanded: vi.fn()
  })
}));

vi.mock('../useFeatureCodeGen', () => ({
  useFeatureCodeGen: vi.fn()
}));

vi.mock('../useFeatureVersioning', () => ({
  useFeatureVersioning: () => ({
    versions: [],
    currentVersionId: 'v1',
    currentVersion: undefined,
    isApproved: false,
    isCurrentVersionDraft: true,
    approveVersion: vi.fn(),
    handleVersionSwitch: vi.fn(),
    handleNewDraft: vi.fn(),
    handleDeleteDraft: vi.fn(),
    handleRenameDraft: vi.fn(),
    handleReplay: vi.fn(),
    handleReset: vi.fn(),
    renameDialogOpen: false,
    setRenameDialogOpen: vi.fn(),
    renameDialogValue: '',
    setRenameDialogValue: vi.fn(),
    handleRenameConfirm: vi.fn(),
    deleteDialogOpen: false,
    setDeleteDialogOpen: vi.fn(),
    handleDeleteConfirm: vi.fn()
  })
}));

vi.mock('../useFeatureApply', () => ({
  useFeatureApply: () => ({
    outputName: '',
    setOutputName: vi.fn(),
    outputFormat: 'csv',
    setOutputFormat: vi.fn(),
    applyStatus: 'idle',
    setApplyStatus: vi.fn(),
    applyMessage: null,
    setApplyMessage: vi.fn(),
    handleApplyFeatures: vi.fn()
  })
}));

vi.mock('../useSuggestionDrafts', () => ({
  useSuggestionDrafts: () => ({
    suggestionDrafts: {},
    toggleSuggestion: vi.fn(),
    updateSuggestionControl: vi.fn()
  })
}));

describe('useFeaturePipelineState', () => {
  beforeEach(() => {
    mockState.hydrateFromBackendMock.mockReset();
    mockState.hydrateFeaturesMock.mockReset();
    mockState.setFeatureRunIdMock.mockReset();
    mockState.setFeatureStepMock.mockReset();
    mockState.fetchFeatureRunMock.mockReset();
    mockState.fetchFeatureRunsMock.mockReset();
    mockState.featureRunIdInStore = null;
    mockState.hydrationError = null;
    mockState.fetchFeatureRunMock.mockResolvedValue({
      run: {
        runId: 'feature-run-1',
        projectId: 'p1',
        features: {},
        createdAt: new Date('2026-02-24T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-02-24T00:00:00.000Z').toISOString()
      }
    });
    mockState.fetchFeatureRunsMock.mockResolvedValue({ runs: [], count: 0, projectId: 'p1' });
    mockState.workflowSession = undefined;
  });

  it('starts a new draft with empty lifecycle state when no feature run exists', async () => {
    const callOrder: string[] = [];
    mockState.hydrateFromBackendMock.mockImplementation(async () => {
      callOrder.push('data');
    });
    mockState.hydrateFeaturesMock.mockImplementation(() => {
      callOrder.push('features');
    });

    renderHook(() => useFeaturePipelineState('p1'));

    await waitFor(() => {
      expect(mockState.hydrateFromBackendMock).toHaveBeenCalledWith('p1');
      expect(mockState.hydrateFeaturesMock).toHaveBeenCalledWith('p1');
    });

    expect(callOrder).toEqual(['data', 'features']);
    // With no featureRunId in store, hydration falls back to fetchFeatureRuns
    // which returns empty runs — so no run is hydrated
    expect(mockState.fetchFeatureRunMock).not.toHaveBeenCalled();
    expect(mockState.fetchFeatureRunsMock).toHaveBeenCalledWith('p1', 1);
    expect(mockState.setFeatureRunIdMock).not.toHaveBeenCalled();
    expect(mockState.setFeatureStepMock).not.toHaveBeenCalled();
  });

  it('rehydrates a draft when fetchFeatureRuns returns a run', async () => {
    // No featureRunId in store — hydration falls back to fetchFeatureRuns
    mockState.fetchFeatureRunsMock.mockResolvedValueOnce({
      runs: [{ runId: 'feature-run-1', projectId: 'p1', features: {}, createdAt: '2026-02-24T00:00:00.000Z', updatedAt: '2026-02-24T00:00:00.000Z' }],
      count: 1
    });

    renderHook(() => useFeaturePipelineState('p1'));

    await waitFor(() => {
      expect(mockState.fetchFeatureRunsMock).toHaveBeenCalledWith('p1', 1);
      expect(mockState.setFeatureRunIdMock).toHaveBeenCalledWith('feature-run-1');
    });
  });

  it('ignores stale cached runs that are missing a features map', async () => {
    // fetchFeatureRuns returns a run with undefined features
    mockState.fetchFeatureRunsMock.mockResolvedValueOnce({
      runs: [{
        runId: 'feature-run-1',
        projectId: 'p1',
        features: undefined,
        createdAt: new Date('2026-02-24T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-02-24T00:00:00.000Z').toISOString()
      }],
      count: 1
    });

    renderHook(() => useFeaturePipelineState('p1'));

    await waitFor(() => {
      expect(mockState.fetchFeatureRunsMock).toHaveBeenCalledWith('p1', 1);
    });

    expect(mockState.setFeatureRunIdMock).toHaveBeenCalledWith('feature-run-1');
    expect(mockState.setFeatureStepMock).not.toHaveBeenCalled();
  });

  it('surfaces hydration failures instead of swallowing them', async () => {
    mockState.hydrateFromBackendMock.mockRejectedValueOnce(new Error('Backend hydration failed'));

    const { result } = renderHook(() => useFeaturePipelineState('p1'));

    await waitFor(() => {
      expect(result.current.panelError).toBe('Backend hydration failed');
    });
  });

  it('surfaces data-store hydration errors before feature hydration continues', async () => {
    mockState.hydrateFromBackendMock.mockImplementation(async () => {
      mockState.hydrationError = 'Datasets unavailable';
    });

    const { result } = renderHook(() => useFeaturePipelineState('p1'));

    await waitFor(() => {
      expect(result.current.panelError).toBe('Datasets unavailable');
    });

    expect(mockState.hydrateFeaturesMock).not.toHaveBeenCalled();
    expect(mockState.fetchFeatureRunMock).not.toHaveBeenCalled();
  });

  it('ignores stale workflow run ids and falls back to project-level feature runs', async () => {
    mockState.featureRunIdInStore = 'workflow-run-1';
    mockState.fetchFeatureRunsMock.mockResolvedValueOnce({
      runs: [{
        runId: 'feat-123',
        projectId: 'p1',
        features: {},
        createdAt: new Date('2026-02-24T00:00:00.000Z').toISOString(),
        updatedAt: new Date('2026-02-24T00:00:00.000Z').toISOString()
      }],
      count: 1,
      projectId: 'p1'
    });

    renderHook(() => useFeaturePipelineState('p1'));

    await waitFor(() => {
      expect(mockState.fetchFeatureRunsMock).toHaveBeenCalledWith('p1', 1);
      expect(mockState.setFeatureRunIdMock).toHaveBeenCalledWith(null);
    });

    expect(mockState.fetchFeatureRunMock).not.toHaveBeenCalled();
    expect(mockState.setFeatureRunIdMock).toHaveBeenLastCalledWith('feat-123');
  });

  it('does not auto-select the first dataset column as the FE target', async () => {
    const { result } = renderHook(() => useFeaturePipelineState('p1'));

    await waitFor(() => {
      expect(result.current.selectedDataset).toBe('dataset-1');
    });

    expect(result.current.targetColumn).toBeUndefined();
  });
});
