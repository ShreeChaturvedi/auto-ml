import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { buildWorkbookTabsStateKey } from '../../storagePersistence';
import { usePreprocessingTabs } from '../usePreprocessingTabs';

const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args)
  }
}));

const ensureNotebookForTabMock = vi.fn(async () => null);
const reconcileTabNotebookMappingsMock = vi.fn(async () => undefined);

vi.mock('../useTabNotebookSync', () => ({
  useTabNotebookSync: () => ({
    ensureNotebookForTab: ensureNotebookForTabMock,
    reconcileTabNotebookMappings: reconcileTabNotebookMappingsMock
  })
}));

describe('usePreprocessingTabs', () => {
  beforeEach(() => {
    localStorage.clear();
    ensureNotebookForTabMock.mockReset();
    ensureNotebookForTabMock.mockResolvedValue(null);
    reconcileTabNotebookMappingsMock.mockReset();
    reconcileTabNotebookMappingsMock.mockResolvedValue(undefined);
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    useNotebookStore.getState().reset();
    useWorkflowSessionStore.setState({ sessions: {} });
    useWorkbookRegistryStore.setState({
      preprocessing: [],
      'feature-engineering': [],
      training: [],
      deleteHandlers: {}
    });
    usePreprocessingStore.setState({
      activeProjectId: 'proj-1',
      tables: [
        {
          datasetId: 'dataset-1',
          name: 'dataset',
          filename: 'dataset.csv',
          sizeBytes: 123,
          columns: []
        }
      ],
      selectedDatasetId: null,
      runId: null,
      nextRunCellMode: 'continue',
      latestCheckpointId: null,
      assistantMessages: [],
      timeline: [],
      stepBindings: {},
      replayReport: null,
      controllerSummary: null,
      isLoadingTables: false,
      error: null
    });
  });

  afterEach(() => {
    localStorage.clear();
    useNotebookStore.getState().reset();
    useWorkflowSessionStore.setState({ sessions: {} });
    useWorkbookRegistryStore.setState({
      preprocessing: [],
      'feature-engineering': [],
      training: [],
      deleteHandlers: {}
    });
  });

  it('creates a new workbook without copying the previous workbook snapshot state', async () => {
    const onNeedsDatasetSelection = vi.fn();

    const { result } = renderHook(() =>
      usePreprocessingTabs({
        projectId: 'proj-1',
        onNeedsDatasetSelection
      })
    );

    await waitFor(() => expect(result.current.tabsReady).toBe(true));

    act(() => {
      usePreprocessingStore.setState({
        selectedDatasetId: 'dataset-1',
        runId: 'prep-run-1',
        timeline: [
          {
            id: 'evt-1',
            runId: 'prep-run-1',
            stepId: 'step-1',
            toolName: 'profile_active_dataset',
            title: 'Profile dataset',
            status: 'applied',
            requiresApproval: false,
            cellIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        stepBindings: {
          'step-1': {
            stepId: 'step-1',
            cellIds: ['cell-1'],
            codeHash: 'hash-1',
            lastSyncedAt: Date.now()
          }
        }
      });
    });

    await waitFor(() => {
      expect(result.current.activeTab?.snapshot).toMatchObject({
        selectedDatasetId: 'dataset-1',
        runId: 'prep-run-1'
      });
    });

    let newWorkbookId: string | null = null;
    act(() => {
      newWorkbookId = result.current.handleNewTab();
    });

    await waitFor(() => expect(result.current.activeTabId).toBe(newWorkbookId));

    expect(result.current.activeTab?.snapshot).toEqual({
      selectedDatasetId: null,
      runId: null,
      timeline: [],
      stepBindings: {},
      replayReport: null
    });
    expect(onNeedsDatasetSelection).toHaveBeenCalledWith('dataset-1');
    expect(toastSuccessMock).toHaveBeenCalledWith('Workbook 2 created');
  });

  it('deletes the active workbook without re-ensuring the fallback notebook when it is already bound', async () => {
    const deleteNotebookMock = vi.fn(async () => true);
    useNotebookStore.setState({
      ...useNotebookStore.getState(),
      deleteNotebook: deleteNotebookMock
    });

    localStorage.setItem(
      buildWorkbookTabsStateKey('proj-1'),
      JSON.stringify({
        activeTabId: 'tab-2',
        tabs: [
          {
            id: 'tab-1',
            name: 'Workbook 1',
            storageVersion: 0,
            notebookId: 'nb-1',
            selectedDatasetId: 'dataset-1'
          },
          {
            id: 'tab-2',
            name: 'Workbook 2',
            storageVersion: 0,
            notebookId: 'nb-2',
            selectedDatasetId: 'dataset-1'
          }
        ]
      })
    );

    const { result } = renderHook(() =>
      usePreprocessingTabs({
        projectId: 'proj-1',
        onNeedsDatasetSelection: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.tabsReady).toBe(true));
    await waitFor(() => expect(result.current.activeTabId).toBe('tab-2'));

    let fallbackTabId: string | null = null;
    act(() => {
      fallbackTabId = result.current.handleDeleteTab();
    });

    await waitFor(() => expect(fallbackTabId).toBe('tab-1'));
    await waitFor(() => expect(result.current.activeTabId).toBe('tab-1'));
    await waitFor(() => expect(deleteNotebookMock).toHaveBeenCalledWith('nb-2'));
  });

  it('registers a sidebar delete handler that removes the targeted inactive workbook', async () => {
    const deleteNotebookMock = vi.fn(async () => true);
    useNotebookStore.setState({
      ...useNotebookStore.getState(),
      deleteNotebook: deleteNotebookMock
    });

    localStorage.setItem(
      buildWorkbookTabsStateKey('proj-1'),
      JSON.stringify({
        activeTabId: 'tab-1',
        tabs: [
          {
            id: 'tab-1',
            name: 'Workbook 1',
            storageVersion: 0,
            notebookId: 'nb-1',
            selectedDatasetId: 'dataset-1'
          },
          {
            id: 'tab-2',
            name: 'Workbook 2',
            storageVersion: 0,
            notebookId: 'nb-2',
            selectedDatasetId: 'dataset-1'
          }
        ]
      })
    );

    const { result } = renderHook(() =>
      usePreprocessingTabs({
        projectId: 'proj-1',
        onNeedsDatasetSelection: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.tabsReady).toBe(true));
    await waitFor(() => expect(result.current.activeTabId).toBe('tab-1'));
    await waitFor(() => {
      expect(useWorkbookRegistryStore.getState().deleteHandlers.preprocessing).toBeTypeOf('function');
    });

    let nextActiveId: string | undefined;
    act(() => {
      nextActiveId = useWorkbookRegistryStore.getState().deleteHandlers.preprocessing?.('tab-2');
    });

    await waitFor(() => expect(nextActiveId).toBe('tab-1'));
    await waitFor(() => expect(result.current.tabs.map((tab) => tab.id)).toEqual(['tab-1']));
    await waitFor(() => expect(result.current.activeTabId).toBe('tab-1'));
    await waitFor(() => expect(deleteNotebookMock).toHaveBeenCalledWith('nb-2'));
  });

  it('does not recycle a deleted workbook number when creating a replacement workbook', async () => {
    const deleteNotebookMock = vi.fn(async () => true);
    useNotebookStore.setState({
      ...useNotebookStore.getState(),
      deleteNotebook: deleteNotebookMock
    });

    localStorage.setItem(
      buildWorkbookTabsStateKey('proj-1'),
      JSON.stringify({
        activeTabId: 'tab-2',
        nextDefaultWorkbookIndex: 3,
        tabs: [
          {
            id: 'tab-1',
            name: 'Workbook 1',
            storageVersion: 0,
            notebookId: 'nb-1',
            selectedDatasetId: 'dataset-1'
          },
          {
            id: 'tab-2',
            name: 'Workbook 2',
            storageVersion: 0,
            notebookId: 'nb-2',
            selectedDatasetId: 'dataset-1'
          }
        ]
      })
    );

    const { result } = renderHook(() =>
      usePreprocessingTabs({
        projectId: 'proj-1',
        onNeedsDatasetSelection: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.tabsReady).toBe(true));
    await waitFor(() => expect(result.current.activeTabId).toBe('tab-2'));

    act(() => {
      result.current.handleDeleteTab();
    });

    await waitFor(() => expect(result.current.tabs.map((tab) => tab.name)).toEqual(['Workbook 1']));

    act(() => {
      result.current.handleNewTab();
    });

    await waitFor(() => expect(result.current.activeTab?.name).toBe('Workbook 3'));
    expect(result.current.tabs.map((tab) => tab.name)).toEqual(['Workbook 1', 'Workbook 3']);
  });

  it('keeps each workbook dataset selection isolated after remounting from a different active workbook', async () => {
    localStorage.setItem(
      buildWorkbookTabsStateKey('proj-1'),
      JSON.stringify({
        activeTabId: 'tab-2',
        tabs: [
          {
            id: 'default',
            name: 'Workbook 1',
            storageVersion: 0,
            notebookId: 'nb-1',
            selectedDatasetId: 'dataset-1'
          },
          {
            id: 'tab-2',
            name: 'Workbook 2',
            storageVersion: 0,
            notebookId: 'nb-2',
            selectedDatasetId: 'dataset-2'
          }
        ]
      })
    );

    usePreprocessingStore.setState((state) => ({
      ...state,
      tables: [
        ...state.tables,
        {
          datasetId: 'dataset-2',
          name: 'dataset-2',
          filename: 'dataset-2.csv',
          sizeBytes: 456,
          columns: []
        }
      ],
      selectedDatasetId: 'dataset-2'
    }));

    const { result } = renderHook(() =>
      usePreprocessingTabs({
        projectId: 'proj-1',
        onNeedsDatasetSelection: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.tabsReady).toBe(true));
    await waitFor(() => expect(result.current.activeTabId).toBe('tab-2'));
    await waitFor(() => {
      expect(result.current.tabs.find((tab) => tab.id === 'default')?.snapshot.selectedDatasetId).toBe('dataset-1');
    });

    act(() => {
      result.current.handleTabSwitch('default');
    });

    await waitFor(() => expect(usePreprocessingStore.getState().selectedDatasetId).toBe('dataset-1'));
    expect(result.current.activeTab?.id).toBe('default');
    expect(result.current.activeTab?.snapshot.selectedDatasetId).toBe('dataset-1');
  });

  it('syncs the workbook URL param whenever the active workbook changes', async () => {
    const syncWorkbookParam = vi.fn();

    const { result } = renderHook(() =>
      usePreprocessingTabs({
        projectId: 'proj-1',
        onNeedsDatasetSelection: vi.fn(),
        requestedTabId: undefined,
        syncWorkbookParam
      })
    );

    await waitFor(() => expect(result.current.tabsReady).toBe(true));
    expect(syncWorkbookParam).toHaveBeenCalledWith(result.current.activeTabId, true);

    act(() => {
      result.current.handleNewTab();
    });

    await waitFor(() => {
      expect(syncWorkbookParam).toHaveBeenLastCalledWith(result.current.activeTabId, true);
    });
  });

  it('does not update tabs when saving a snapshot for a stale active tab ref', async () => {
    const { result } = renderHook(() =>
      usePreprocessingTabs({
        projectId: 'proj-1',
        onNeedsDatasetSelection: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.tabsReady).toBe(true));

    const initialTabs = result.current.tabs;

    act(() => {
      result.current.activeTabIdRef.current = 'missing-tab';
      result.current.saveActiveSnapshot();
    });

    expect(result.current.tabs).toBe(initialTabs);
  });
});
