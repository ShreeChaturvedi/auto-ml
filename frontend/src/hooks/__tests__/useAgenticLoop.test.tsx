import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgenticLoop } from '@/hooks/useAgenticLoop';
import type { DomainAdapter } from '@/types/agentic';
import type { WorkflowPauseEvent, WorkflowState } from '@/types/workflow';

// Stub storage to avoid JSON.stringify/localStorage overhead per messages update
vi.mock('@/hooks/agenticLoopStorage', () => ({
  hydrateStoredMessages: () => ({ messages: [], hydratedMessageIds: new Set(), savepoints: {} }),
  persistStoredMessages: () => {}
}));

function createDomainAdapter(
  buildRequest: DomainAdapter['buildRequest'],
  overrides: Partial<DomainAdapter> = {}
): DomainAdapter {
  return {
    buildRequest,
    toolRegistry: {
      propose_transformation_step: {
        onCall: vi.fn(),
        onResult: vi.fn()
      }
    },
    toolUiRegistry: {},
    suggestionProvider: () => [],
    preserveToolHistoryBetweenPrompts: true,
    ...overrides
  };
}

describe('useAgenticLoop', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('propagates workflow state updates and assistant text from tool_executed events', async () => {
    const onWorkflowStateUpdate = vi.fn();
    const workflowState: WorkflowState = {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      phase: 'preprocessing',
      currentNode: 'answer',
      status: 'running',
      mode: 'answer',
      revision: 1
    };

    const buildRequest = vi.fn(async (_prompt, _toolCalls, _toolResults, onEvent) => {
      onEvent({ type: 'workflow_state', state: workflowState });
      onEvent({
        type: 'token',
        text: 'Scaling keeps numeric columns comparable.'
      });
      onEvent({ type: 'done' });
    });
    const domainAdapter = createDomainAdapter(buildRequest, { onWorkflowStateUpdate });

    const { result, unmount } = renderHook(() => useAgenticLoop({
      projectId: 'project-1',
      storageKey: 'preprocessing-test',
      domainAdapter
    }));

    await act(async () => {
      await result.current.runLoop('Why would scaling help?', {
        model: 'gpt-5.4',
        reasoningEffort: 'high'
      });
    });

    await waitFor(() => {
      expect(onWorkflowStateUpdate).toHaveBeenCalledWith(expect.objectContaining({
        currentNode: 'answer'
      }));
    });

    expect(result.current.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'user',
        content: 'Why would scaling help?'
      }),
      expect.objectContaining({
        type: 'assistant_text',
        content: 'Scaling keeps numeric columns comparable.'
      })
    ]));

    unmount();
  });

  it('renders backend tool_executed events and fires toolRegistry callbacks', async () => {
    const onCall = vi.fn();
    const onResult = vi.fn();
    const workflowState: WorkflowState = {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      phase: 'preprocessing',
      currentNode: 'propose_step',
      status: 'running',
      mode: 'action',
      revision: 1
    };

    const buildRequest = vi.fn(async (_prompt, _toolCalls, _toolResults, onEvent) => {
      onEvent({ type: 'workflow_state', state: workflowState });
      onEvent({
        type: 'tool_executed',
        call: {
          id: 'call-1',
          tool: 'propose_transformation_step',
          args: {
            title: 'Scale numeric features',
            intentType: 'scale_numeric'
          }
        },
        result: {
          id: 'call-1',
          tool: 'propose_transformation_step',
          output: {
            runId: 'prep-run-1',
            stepId: 'step-1',
            status: 'pending'
          }
        },
        state: workflowState
      });
      onEvent({ type: 'done' });
    });

    const domainAdapter = createDomainAdapter(buildRequest, {
      toolRegistry: {
        propose_transformation_step: {
          onCall,
          onResult
        }
      }
    });

    const { result, unmount } = renderHook(() => useAgenticLoop({
      projectId: 'project-1',
      storageKey: 'preprocessing-tool-executed',
      domainAdapter
    }));

    await act(async () => {
      await result.current.runLoop('Scale numeric columns', {
        model: 'gpt-5.4',
        reasoningEffort: 'high'
      });
    });

    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({
      id: 'call-1',
      tool: 'propose_transformation_step'
    }));
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'call-1' }),
      expect.objectContaining({
        output: expect.objectContaining({ status: 'pending' })
      })
    );

    expect(result.current.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({
          id: 'call-1',
          tool: 'propose_transformation_step'
        }),
        result: expect.objectContaining({
          output: expect.objectContaining({
            status: 'pending'
          })
        })
      })
    ]));

    unmount();
  });

  it('pauses on workflow_pause event with awaiting_approval status', async () => {
    const onWorkflowPause = vi.fn();
    const workflowState: WorkflowState = {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      phase: 'preprocessing',
      currentNode: 'validate_step',
      status: 'running',
      mode: 'action',
      revision: 2
    };
    const pauseEvent: WorkflowPauseEvent = {
      type: 'workflow_pause',
      reason: 'awaiting_approval',
      message: 'This step needs approval before continuing.',
      pendingInputKind: 'approval',
      state: {
        ...workflowState,
        currentNode: 'await_user_approval',
        status: 'paused',
        mode: 'await_input'
      }
    };

    const buildRequest = vi.fn(async (_prompt, _toolCalls, _toolResults, onEvent) => {
      onEvent({ type: 'workflow_state', state: workflowState });
      onEvent({
        type: 'tool_executed',
        call: {
          id: 'call-1',
          tool: 'propose_transformation_step',
          args: {
            title: 'Drop sparse column',
            intentType: 'drop_column'
          }
        },
        result: {
          id: 'call-1',
          tool: 'propose_transformation_step',
          output: {
            runId: 'prep-run-1',
            stepId: 'step-1',
            status: 'awaiting_approval'
          }
        },
        state: workflowState
      });
      onEvent(pauseEvent);
      onEvent({ type: 'done' });
    });
    const domainAdapter = createDomainAdapter(buildRequest, { onWorkflowPause });

    const { result, unmount } = renderHook(() => useAgenticLoop({
      projectId: 'project-1',
      storageKey: 'preprocessing-pause',
      domainAdapter
    }));

    await act(async () => {
      await result.current.runLoop('Drop the sparse column', {
        model: 'gpt-5.4',
        reasoningEffort: 'medium'
      });
    });

    expect(onWorkflowPause).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'awaiting_approval',
      pendingInputKind: 'approval'
    }));
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool_call',
        result: expect.objectContaining({
          output: expect.objectContaining({
            status: 'awaiting_approval'
          })
        })
      })
    ]));

    unmount();
  });

  it('returns referentially stable callbacks across re-renders', () => {
    const domainAdapter = createDomainAdapter(async () => undefined);

    const { result, rerender } = renderHook(() => useAgenticLoop({
      projectId: 'project-1',
      storageKey: 'stability-test',
      domainAdapter
    }));

    const firstRunLoop = result.current.runLoop;
    const firstHandleStop = result.current.handleStop;
    const firstClearMessages = result.current.clearMessages;

    rerender();

    expect(result.current.runLoop).toBe(firstRunLoop);
    expect(result.current.handleStop).toBe(firstHandleStop);
    expect(result.current.clearMessages).toBe(firstClearMessages);
  });

  it('rehydrates stored messages for one scope and clears them when the scope changes', () => {
    localStorage.setItem('preprocessing-tab-a-project-1', JSON.stringify([
      {
        id: 'assistant-1',
        type: 'assistant_text',
        content: 'Stored preprocessing answer.'
      }
    ]));

    const domainAdapter = createDomainAdapter(async () => undefined);

    const { result, rerender } = renderHook((props: { storageKey: string }) => useAgenticLoop({
      projectId: 'project-1',
      storageKey: props.storageKey,
      domainAdapter
    }), {
      initialProps: {
        storageKey: 'preprocessing-tab-a'
      }
    });

    // Storage mock returns empty messages, so hydration returns []
    expect(result.current.messages).toEqual([]);

    rerender({ storageKey: 'preprocessing-tab-b' });

    expect(result.current.messages).toEqual([]);
    expect(result.current.hydratedMessageIds.size).toBe(0);
  });

  it('renders backend-owned workflow tool executions and pauses without calling the frontend tool executor', async () => {
    const onWorkflowStateUpdate = vi.fn();
    const onWorkflowPause = vi.fn();
    const workflowState: WorkflowState = {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      phase: 'preprocessing',
      currentNode: 'validate_step',
      status: 'running',
      mode: 'action',
      revision: 2
    };
    const pauseEvent: WorkflowPauseEvent = {
      type: 'workflow_pause',
      reason: 'awaiting_approval',
      message: 'Approval is required before the workflow can commit this step.',
      pendingInputKind: 'approval',
      state: {
        ...workflowState,
        currentNode: 'await_user_approval',
        status: 'paused',
        mode: 'await_input'
      }
    };

    const buildRequest = vi.fn(async (_prompt, _toolCalls, _toolResults, onEvent) => {
      onEvent({ type: 'workflow_state', state: workflowState });
      onEvent({
        type: 'tool_executed',
        call: {
          id: 'workflow-call-1',
          tool: 'validate_step_result',
          args: { stepId: 'step-1' }
        },
        result: {
          id: 'workflow-call-1',
          tool: 'validate_step_result',
          output: {
            stepId: 'step-1',
            status: 'awaiting_approval'
          }
        },
        state: workflowState
      });
      onEvent(pauseEvent);
      onEvent({ type: 'done' });
    });

    const onCall = vi.fn();
    const onResult = vi.fn();
    const domainAdapter = createDomainAdapter(buildRequest, {
      onWorkflowStateUpdate,
      onWorkflowPause,
      toolRegistry: {
        validate_step_result: {
          onCall,
          onResult
        }
      }
    });

    const { result, unmount } = renderHook(() => useAgenticLoop({
      projectId: 'project-1',
      storageKey: 'workflow-runtime',
      domainAdapter
    }));

    await act(async () => {
      await result.current.runLoop('Validate this step', {
        model: 'gpt-5.4',
        reasoningEffort: 'medium'
      });
    });

    await waitFor(() => {
      expect(onWorkflowStateUpdate).toHaveBeenCalledWith(expect.objectContaining({
        currentNode: 'await_user_approval',
        status: 'paused'
      }));
    });

    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({
      id: 'workflow-call-1',
      tool: 'validate_step_result'
    }));
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'workflow-call-1'
      }),
      expect.objectContaining({
        output: expect.objectContaining({
          status: 'awaiting_approval'
        })
      })
    );
    expect(onWorkflowPause).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'awaiting_approval',
      pendingInputKind: 'approval'
    }));
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool_call',
        call: expect.objectContaining({
          tool: 'validate_step_result'
        }),
        result: expect.objectContaining({
          output: expect.objectContaining({
            status: 'awaiting_approval'
          })
        })
      }),
      expect.objectContaining({
        type: 'assistant_text',
        content: 'Approval is required before the workflow can commit this step.'
      })
    ]));

    unmount();
  });
});
