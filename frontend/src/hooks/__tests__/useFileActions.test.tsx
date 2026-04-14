import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/client';
import { useFileActions } from '../useFileActions';

const navigateMock = vi.fn();
const deleteDatasetMock = vi.fn();
const deleteDocumentMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

const dataState = vi.hoisted(() => ({
  files: [
    {
      id: 'file-1',
      name: 'Feature_v1.csv',
      projectId: 'p1',
      type: 'csv',
      metadata: { datasetId: 'dataset-1' }
    }
  ],
  activeFileTabId: null as string | null,
  openFileTab: vi.fn(),
  removeFile: vi.fn(),
  markDeleted: vi.fn(),
  hydrateFromBackend: vi.fn()
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: '/project/p1/data-viewer' })
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: vi.fn()
  }
}));

vi.mock('@/lib/api/datasets', () => ({
  deleteDataset: (...args: unknown[]) => deleteDatasetMock(...args)
}));

vi.mock('@/lib/api/documents', () => ({
  deleteDocument: (...args: unknown[]) => deleteDocumentMock(...args)
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector(dataState),
    { getState: () => dataState }
  )
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) => selector({
    isPhaseUnlocked: () => true,
    projects: [{ id: 'p1', currentPhase: 'data-viewer' }]
  })
}));

describe('useFileActions', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    deleteDatasetMock.mockReset();
    deleteDocumentMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    dataState.openFileTab.mockReset();
    dataState.removeFile.mockReset();
    dataState.markDeleted.mockReset();
    dataState.hydrateFromBackend.mockReset();
    deleteDatasetMock.mockResolvedValue(undefined);
    deleteDocumentMock.mockResolvedValue(undefined);
    dataState.hydrateFromBackend.mockResolvedValue(undefined);
  });

  it('shows a success toast when a data file is deleted', async () => {
    const { result } = renderHook(() => useFileActions('p1'));

    await act(async () => {
      await result.current.handleDeleteFile(dataState.files[0] as never);
    });

    expect(deleteDatasetMock).toHaveBeenCalledWith('dataset-1');
    expect(dataState.removeFile).toHaveBeenCalledWith('file-1');
    expect(dataState.hydrateFromBackend).toHaveBeenCalledWith('p1', { force: true });
    expect(toastSuccessMock).toHaveBeenCalledWith('Feature_v1.csv deleted');
  });

  it('surfaces blocker details when dataset deletion is rejected', async () => {
    deleteDatasetMock.mockRejectedValueOnce(
      new ApiError('blocked', 409, {
        error: 'DATASET_IN_USE',
        activeWorkflows: [
          {
            runId: 'run-12345678',
            phase: 'feature_engineering',
            status: 'paused',
            pendingInputKind: 'approval',
            activeNotebookId: 'nb-abcdef12'
          }
        ]
      })
    );

    const { result } = renderHook(() => useFileActions('p1'));

    await act(async () => {
      await result.current.handleDeleteFile(dataState.files[0] as never);
    });

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Couldn't delete Feature_v1.csv",
      expect.objectContaining({
        description: expect.stringContaining('feature engineering run run-1234 is paused, waiting for approval, notebook nb-abcde')
      })
    );
  });
});
