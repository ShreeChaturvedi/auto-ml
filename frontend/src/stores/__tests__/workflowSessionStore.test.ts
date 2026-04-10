import { afterEach, describe, expect, it } from 'vitest';

import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';

describe('workflowSessionStore', () => {
  afterEach(() => {
    useWorkflowSessionStore.setState({ sessions: {} });
    localStorage.clear();
  });

  it('persists only the resumable workflow state subset', () => {
    useWorkflowSessionStore.getState().updateSession('session-1', {
      runId: 'run-1',
      threadId: 'thread-1',
      phase: 'preprocessing',
      currentNode: 'summarize',
      status: 'completed',
      revision: 2,
      activeStepId: 'step-1',
      pendingInputKind: 'approval',
      pauseReason: 'awaiting_review',
      activeDatasetId: 'dataset-1',
      activeNotebookId: 'notebook-1',
      mode: 'completed',
      metadata: {
        history: {
          toolCalls: [{ id: 'call-1', tool: 'write_cell', args: { content: 'very large notebook code' } }]
        }
      }
    });

    const session = useWorkflowSessionStore.getState().getSession('session-1');
    expect(session).toEqual({
      runId: 'run-1',
      threadId: 'thread-1',
      state: {
        runId: 'run-1',
        threadId: 'thread-1',
        phase: 'preprocessing',
        currentNode: 'summarize',
        status: 'completed',
        revision: 2,
        activeStepId: 'step-1',
        pendingInputKind: 'approval',
        pauseReason: 'awaiting_review',
        activeDatasetId: 'dataset-1',
        activeNotebookId: 'notebook-1',
        mode: 'completed'
      }
    });
    expect(session?.state).not.toHaveProperty('metadata');
  });
});
