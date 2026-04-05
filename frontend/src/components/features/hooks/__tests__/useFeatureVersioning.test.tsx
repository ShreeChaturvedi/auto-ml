import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureStore } from '@/stores/featureStore';
import {
  buildWorkflowSessionKey,
  useWorkflowSessionStore
} from '@/stores/workflowSessionStore';
import { useFeatureVersioning } from '../useFeatureVersioning';

const interruptWorkflowRunMock = vi.fn();
const createNotebookMock = vi.fn();
const deleteNotebookMock = vi.fn();
const initializeNotebookMock = vi.fn();
const loadNotebooksMock = vi.fn();

vi.mock('@/lib/api/llm', () => ({
  interruptWorkflowRun: (...args: unknown[]) => interruptWorkflowRunMock(...args)
}));

vi.mock('@/lib/api/notebooks', () => ({
  createNotebook: (...args: unknown[]) => createNotebookMock(...args),
  deleteNotebook: (...args: unknown[]) => deleteNotebookMock(...args)
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

  beforeEach(() => {
    interruptWorkflowRunMock.mockReset();
    interruptWorkflowRunMock.mockResolvedValue({ run: { runId: 'feature-run-1' } });
    createNotebookMock.mockReset();
    createNotebookMock.mockResolvedValue({ notebookId: 'fresh-fe-nb-1' });
    deleteNotebookMock.mockReset();
    deleteNotebookMock.mockResolvedValue({ success: true, fallbackNotebookId: 'fresh-fe-nb-1' });
    initializeNotebookMock.mockReset();
    initializeNotebookMock.mockResolvedValue(undefined);
    loadNotebooksMock.mockReset();
    loadNotebooksMock.mockResolvedValue(undefined);
    useFeatureStore.setState({
      ...initialFeatureState,
      versions: {
        [projectId]: [{
          id: versionId,
          projectId,
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
          notebookId: 'old-fe-nb-1'
        }]
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

  it('interrupts and clears the persisted workflow session when resetting the current draft', async () => {
    localStorage.setItem(`${storageKey}-${projectId}`, JSON.stringify({
      messages: [{ id: 'msg-1', type: 'user', content: 'hello' }],
      savepoints: {}
    }));

    const { result } = renderHook(() => useFeatureVersioning({
      projectId,
      setPanelError: vi.fn(),
      setApplyStatus: vi.fn(),
      setApplyMessage: vi.fn()
    }));

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
    expect(deleteNotebookMock).toHaveBeenCalledWith(projectId, 'old-fe-nb-1');
    expect(loadNotebooksMock).toHaveBeenCalledWith(projectId);
  });
});
