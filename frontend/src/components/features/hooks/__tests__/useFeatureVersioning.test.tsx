import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureStore } from '@/stores/featureStore';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import {
  buildWorkflowSessionKey,
  useWorkflowSessionStore
} from '@/stores/workflowSessionStore';
import { useFeatureVersioning } from '../useFeatureVersioning';
import type { PipelineVersion } from '@/types/feature';

const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args)
  }
}));

function makeDraftVersion(overrides: Partial<PipelineVersion> & { id: string }): PipelineVersion {
  return {
    projectId: 'project-1',
    name: 'Draft Pipeline v1',
    status: 'draft',
    createdAt: new Date('2026-03-23T00:00:00.000Z').toISOString(),
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
    ...overrides
  };
}

const interruptWorkflowRunMock = vi.fn();
const createNotebookMock = vi.fn();
const archivePhaseNotebookMock = vi.fn();
const initializeNotebookMock = vi.fn();
const loadNotebooksMock = vi.fn();

vi.mock('@/lib/api/llm', () => ({
  interruptWorkflowRun: (...args: unknown[]) => interruptWorkflowRunMock(...args)
}));

vi.mock('@/lib/api/notebooks', () => ({
  createNotebook: (...args: unknown[]) => createNotebookMock(...args),
  deleteNotebook: vi.fn()
}));

vi.mock('@/lib/notebook/archivePhaseNotebook', () => ({
  archivePhaseNotebook: (...args: unknown[]) => archivePhaseNotebookMock(...args)
}));

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: {
    getState: () => ({
      initializeNotebook: initializeNotebookMock,
      loadNotebooks: loadNotebooksMock
    })
  }
}));

describe('useFeatureVersioning', () => {
  const projectId = 'project-1';
  const versionId = 'draft-1';
  const storageKey = `feature-engineering-messages-v3-${versionId}`;
  const sessionKey = buildWorkflowSessionKey(projectId, storageKey);
  const initialFeatureState = useFeatureStore.getState();
  const initialWorkflowSessionState = useWorkflowSessionStore.getState();

  function renderVersioning(overrides?: Partial<Parameters<typeof useFeatureVersioning>[0]>) {
    return renderHook(() => useFeatureVersioning({
      projectId,
      setPanelError: vi.fn(),
      setApplyStatus: vi.fn(),
      setApplyMessage: vi.fn(),
      ...overrides
    }));
  }

  beforeEach(() => {
    interruptWorkflowRunMock.mockReset();
    interruptWorkflowRunMock.mockResolvedValue({ run: { runId: 'feature-run-1' } });
    createNotebookMock.mockReset();
    createNotebookMock.mockResolvedValue({ notebookId: 'fresh-fe-nb-1' });
    archivePhaseNotebookMock.mockReset();
    archivePhaseNotebookMock.mockResolvedValue({ archived: true });
    initializeNotebookMock.mockReset();
    initializeNotebookMock.mockResolvedValue(undefined);
    loadNotebooksMock.mockReset();
    loadNotebooksMock.mockResolvedValue(undefined);
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    useFeatureStore.setState({
      ...initialFeatureState,
      versions: {
        [projectId]: [makeDraftVersion({ id: versionId, notebookId: 'old-fe-nb-1' })]
      },
      currentVersionId: {
        [projectId]: versionId
      },
      featureSteps: {
        'feat-1': {
          stepId: 'feat-1',
          name: 'log_salary',
          method: 'log_transform',
          status: 'executed'
        }
      },
      currentStage: 'execute_feature',
      featureRunId: 'feature-run-1',
      setVersionNotebookId: initialFeatureState.setVersionNotebookId,
      syncFeaturesToProject: vi.fn().mockResolvedValue(undefined)
    });

    useWorkflowSessionStore.setState({
      ...initialWorkflowSessionState,
      sessions: {
        [sessionKey]: {
          runId: 'feature-run-1',
          threadId: 'feature-thread-1',
          state: {
            runId: 'feature-run-1',
            threadId: 'feature-thread-1',
            phase: 'feature_engineering',
            currentNode: 'execute_feature',
            status: 'running'
          }
        }
      }
    });
  });

  afterEach(() => {
    useWorkbookRegistryStore.getState().setDeleteHandler('feature-engineering', null);
  });

  it('interrupts and clears the persisted workflow session when resetting the current draft', async () => {
    localStorage.setItem(`${storageKey}-${projectId}`, JSON.stringify({
      messages: [{ id: 'msg-1', type: 'user', content: 'hello' }],
      savepoints: {}
    }));

    const { result } = renderVersioning();

    await act(async () => {
      await result.current.handleReset();
    });

    expect(result.current.chatSessionVersion).toBe(1);
    expect(useFeatureStore.getState().featureRunId).toBeNull();
    expect(useFeatureStore.getState().currentStage).toBeNull();
    expect(useFeatureStore.getState().featureSteps).toEqual({});
    expect(useFeatureStore.getState().versions[projectId]?.[0]?.notebookId).toBe('fresh-fe-nb-1');
    expect(useWorkflowSessionStore.getState().getSession(sessionKey)).toBeUndefined();
    expect(localStorage.getItem(`${storageKey}-${projectId}`)).toBeNull();
    expect(interruptWorkflowRunMock).toHaveBeenCalledWith('feature-run-1', 'Draft reset by user.');
    expect(createNotebookMock).toHaveBeenCalledWith(projectId, expect.objectContaining({
      name: 'Draft Pipeline v1',
      metadata: expect.objectContaining({
        phase: 'feature-engineering',
        tabId: versionId,
        tabName: 'Draft Pipeline v1'
      })
    }));
    expect(initializeNotebookMock).toHaveBeenCalledWith(projectId, 'fresh-fe-nb-1');
    expect(archivePhaseNotebookMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId,
      notebookId: 'old-fe-nb-1',
      phase: 'feature-engineering',
      tabId: versionId,
      tabName: 'Draft Pipeline v1'
    }));
    expect(loadNotebooksMock).toHaveBeenCalledWith(projectId);
  });

  it('shows a success toast when creating a new draft', () => {
    const { result } = renderVersioning();

    act(() => {
      result.current.handleNewDraft();
    });

    expect(toastSuccessMock).toHaveBeenCalledWith('New Draft Pipeline created');
  });

  describe('sidebar delete handler', () => {
    it('registers on mount and deregisters on unmount', () => {
      const { unmount } = renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering'];
      expect(handler).toBeTypeOf('function');

      unmount();

      const handlerAfterUnmount = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering'];
      expect(handlerAfterUnmount).toBeUndefined();
    });

    it('deletes a draft version and returns the new current ID', () => {
      const secondId = 'draft-2';
      useFeatureStore.setState({
        versions: {
          [projectId]: [
            makeDraftVersion({ id: versionId }),
            makeDraftVersion({ id: secondId, name: 'Draft Pipeline v2' })
          ]
        },
        currentVersionId: { [projectId]: versionId }
      });

      renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering']!;
      let newId: string | undefined;
      act(() => {
        newId = handler(versionId);
      });

      const state = useFeatureStore.getState();
      expect(state.versions[projectId]).toHaveLength(1);
      expect(state.versions[projectId]![0].id).toBe(secondId);
      expect(newId).toBe(secondId);
    });

    it('rejects deletion of approved versions', () => {
      useFeatureStore.setState({
        versions: {
          [projectId]: [makeDraftVersion({ id: versionId, status: 'approved' })]
        }
      });

      renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering']!;
      let result: string | undefined;
      act(() => {
        result = handler(versionId);
      });

      expect(result).toBeUndefined();
      expect(useFeatureStore.getState().versions[projectId]).toHaveLength(1);
    });

    it('creates a replacement draft when deleting the last version', () => {
      renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering']!;
      let newId: string | undefined;
      act(() => {
        newId = handler(versionId);
      });

      const state = useFeatureStore.getState();
      // A replacement draft was created, old one removed
      expect(state.versions[projectId]).toHaveLength(1);
      expect(state.versions[projectId]![0].id).not.toBe(versionId);
      expect(state.versions[projectId]![0].name).toBe('Draft Pipeline v1');
      expect(newId).toBe(state.versions[projectId]![0].id);
    });

    it('clears feature store ephemeral state on delete', () => {
      renderVersioning();

      const handler = useWorkbookRegistryStore.getState().deleteHandlers['feature-engineering']!;
      act(() => {
        handler(versionId);
      });

      const state = useFeatureStore.getState();
      expect(state.featureRunId).toBeNull();
      expect(state.currentStage).toBeNull();
      expect(state.featureSteps).toEqual({});
    });
  });
});
