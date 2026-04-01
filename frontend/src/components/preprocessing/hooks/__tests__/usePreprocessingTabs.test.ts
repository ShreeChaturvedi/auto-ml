import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { usePreprocessingTabs } from '../usePreprocessingTabs';

vi.mock('../useTabNotebookSync', () => ({
  useTabNotebookSync: () => ({
    ensureNotebookForTab: vi.fn(async () => null),
    reconcileTabNotebookMappings: vi.fn(async () => undefined)
  })
}));

describe('usePreprocessingTabs', () => {
  beforeEach(() => {
    localStorage.clear();
    useNotebookStore.getState().reset();
    useWorkflowSessionStore.setState({ sessions: {} });
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
