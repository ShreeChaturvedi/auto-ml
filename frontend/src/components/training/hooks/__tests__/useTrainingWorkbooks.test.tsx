import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import {
  buildWorkflowSessionKey,
  useWorkflowSessionStore
} from '@/stores/workflowSessionStore';

import {
  buildTrainingWorkbookMessageKey,
  buildTrainingWorkbooksStateKey
} from '../../trainingWorkbookPersistence';
import { useTrainingWorkbooks } from '../useTrainingWorkbooks';

const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const interruptWorkflowRunMock = vi.hoisted(() => vi.fn());
const listWorkflowRunsMock = vi.hoisted(() => vi.fn());
const archivePhaseNotebookMock = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args)
  }
}));

vi.mock('@/lib/api/llm', () => ({
  interruptWorkflowRun: (...args: unknown[]) => interruptWorkflowRunMock(...args),
  listWorkflowRuns: (...args: unknown[]) => listWorkflowRunsMock(...args)
}));

vi.mock('@/lib/notebook/archivePhaseNotebook', () => ({
  archivePhaseNotebook: (...args: unknown[]) => archivePhaseNotebookMock(...args)
}));

describe('useTrainingWorkbooks', () => {
  const projectId = 'project-1';
  const initialWorkflowSessionState = useWorkflowSessionStore.getState();

  beforeEach(() => {
    localStorage.clear();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    interruptWorkflowRunMock.mockReset();
    interruptWorkflowRunMock.mockResolvedValue({ run: { runId: 'training-run-1' } });
    listWorkflowRunsMock.mockReset();
    listWorkflowRunsMock.mockResolvedValue({ projectId, phase: 'training', runs: [] });
    archivePhaseNotebookMock.mockReset();
    archivePhaseNotebookMock.mockResolvedValue('archived');

    useWorkflowSessionStore.setState({
      ...initialWorkflowSessionState,
      sessions: {}
    });
    useWorkbookRegistryStore.setState({
      preprocessing: [],
      'feature-engineering': [],
      training: [],
      activeWorkbookIds: {},
      deleteHandlers: {}
    });
  });

  function seedTrainingWorkbooks() {
    localStorage.setItem(buildTrainingWorkbooksStateKey(projectId), JSON.stringify({
      activeWorkbookId: 'training-wb-1',
      workbooks: [
        { id: 'training-wb-1', name: 'Workbook 1', notebookId: 'training-nb-1' },
        { id: 'training-wb-2', name: 'Workbook 2', notebookId: 'training-nb-2' },
        { id: 'training-wb-3', name: 'Workbook 3', notebookId: 'training-nb-3' }
      ]
    }));
  }

  it('interrupts a reset workflow session even when the session key includes dataset/target suffixes', async () => {
    seedTrainingWorkbooks();

    const storageKey = buildTrainingWorkbookMessageKey('training-wb-1', projectId);
    const suffixedSessionKey = buildWorkflowSessionKey(projectId, `${storageKey}:dataset-1:target_col`);

    useWorkflowSessionStore.setState({
      sessions: {
        [suffixedSessionKey]: {
          runId: 'training-run-1',
          threadId: 'training-thread-1',
          state: {
            runId: 'training-run-1',
            threadId: 'training-thread-1',
            phase: 'training',
            currentNode: 'execute_training',
            status: 'running'
          }
        }
      }
    });

    const { result } = renderHook(() => useTrainingWorkbooks(projectId));

    await act(async () => {
      result.current.handleReset();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(interruptWorkflowRunMock).toHaveBeenCalledWith('training-run-1', 'Training workbook reset by user.');
    });
    expect(useWorkflowSessionStore.getState().sessions[suffixedSessionKey]).toBeUndefined();
  });

  it('falls back to backend workflow discovery when the local session store missed the active training run', async () => {
    seedTrainingWorkbooks();

    listWorkflowRunsMock.mockResolvedValue({
      projectId,
      phase: 'training',
      runs: [
        {
          runId: 'training-run-from-api',
          threadId: 'training-thread-from-api',
          projectId,
          phase: 'training',
          status: 'running',
          currentNode: 'execute_training',
          revision: 1,
          activeNotebookId: 'training-nb-1',
          retryBudget: 0,
          repairAttemptCount: 0,
          createdAt: '2026-04-14T00:00:00.000Z',
          updatedAt: '2026-04-14T00:00:00.000Z'
        }
      ]
    });

    const { result } = renderHook(() => useTrainingWorkbooks(projectId));

    await act(async () => {
      result.current.handleReset();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(listWorkflowRunsMock).toHaveBeenCalledWith(projectId, 'training');
      expect(interruptWorkflowRunMock).toHaveBeenCalledWith('training-run-from-api', 'Training workbook reset by user.');
    });
  });

  it('registers a real sidebar delete handler so deleted workbooks do not reappear on the next refresh/reset cycle', async () => {
    seedTrainingWorkbooks();

    const { result } = renderHook(() => useTrainingWorkbooks(projectId));

    const deleteHandler = useWorkbookRegistryStore.getState().deleteHandlers.training;
    expect(deleteHandler).toBeTypeOf('function');

    let fallbackId: string | undefined;
    act(() => {
      fallbackId = deleteHandler?.('training-wb-2');
    });

    expect(fallbackId).toBe('training-wb-1');

    await waitFor(() => {
      expect(result.current.workbooks.map((workbook) => workbook.id)).toEqual(['training-wb-1', 'training-wb-3']);
    });

    act(() => {
      useWorkbookRegistryStore.getState().deleteHandlers.training?.('training-wb-3');
    });

    await waitFor(() => {
      expect(result.current.workbooks.map((workbook) => workbook.id)).toEqual(['training-wb-1']);
    });

    await act(async () => {
      result.current.handleReset();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.workbooks.map((workbook) => workbook.id)).toEqual(['training-wb-1']);
    });

    const persisted = JSON.parse(localStorage.getItem(buildTrainingWorkbooksStateKey(projectId)) ?? '{}') as {
      workbooks?: Array<{ id: string }>;
    };
    expect(persisted.workbooks?.map((workbook) => workbook.id)).toEqual(['training-wb-1']);
  });
});
