import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgenticLoop } from '@/hooks/useAgenticLoop';
import { executeToolCalls } from '@/lib/api/llm';
import type { DomainAdapter } from '@/types/agentic';
import type { PreprocessingControllerSummary } from '@/types/preprocessing';
import type { WorkflowPauseEvent, WorkflowState } from '@/types/workflow';

vi.mock('@/lib/api/llm', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/llm')>('@/lib/api/llm');
  return {
    ...actual,
    executeToolCalls: vi.fn()
  };
});

const executeToolCallsMock = vi.mocked(executeToolCalls);

function buildControllerSummary(overrides: Partial<PreprocessingControllerSummary> = {}): PreprocessingControllerSummary {
  return {
    threadId: 'prep-thread:test',
    turnMode: 'action_required',
    currentNode: 'plan_step',
    allowedTools: ['propose_transformation_step'],
    allowTextResponse: false,
    requireToolCall: true,
    pendingApproval: false,
    updatedAt: '2026-03-13T00:00:00.000Z',
    ...overrides
  };
}

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
    executeToolCallsMock.mockReset();
    vi.useRealTimers();
  });

  it('propagates controller updates and assistant text from preprocessing envelopes', async () => {
    const onControllerUpdate = vi.fn();
    const buildRequest = vi.fn(async (_prompt, _toolCalls, _toolResults, onEvent) => {
      onEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind: 'preprocessing',
          message: 'Scaling keeps numeric columns comparable.',
          controller: buildControllerSummary({
            turnMode: 'answer_only',
            currentNode: 'answer',
            allowTextResponse: true,
            requireToolCall: false,
            pendingApproval: false,
            allowedTools: []
          })
        }
      });
      onEvent({ type: 'done' });
    });
    const domainAdapter = createDomainAdapter(buildRequest, { onControllerUpdate });

    const { result } = renderHook(() => useAgenticLoop({
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
      expect(onControllerUpdate).toHaveBeenCalledWith(expect.objectContaining({
        currentNode: 'answer',
        turnMode: 'answer_only'
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
  });

  it('restreams after tool execution with continuation metadata and merged tool history', async () => {
    vi.useFakeTimers();
    executeToolCallsMock.mockResolvedValue({
      results: [
        {
          id: 'call-1',
          tool: 'propose_transformation_step',
          output: {
            runId: 'prep-run-1',
            stepId: 'step-1',
            status: 'pending'
          }
        }
      ]
    });

    const buildRequest = vi.fn(async (_prompt, _toolCalls, _toolResults, onEvent, _signal, options) => {
      if (!options.continuation) {
        onEvent({
          type: 'envelope',
          envelope: {
            version: '1',
            kind: 'preprocessing',
            message: 'I will add a scaling step.',
            controller: buildControllerSummary(),
            tool_calls: [
              {
                id: 'call-1',
                tool: 'propose_transformation_step',
                args: {
                  title: 'Scale numeric features',
                  intentType: 'scale_numeric'
                }
              }
            ]
          }
        });
        return;
      }

      onEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind: 'preprocessing',
          message: 'Step proposed and ready for code generation.',
          controller: buildControllerSummary({
            currentNode: 'generate_code',
            allowedTools: ['materialize_step_code']
          })
        }
      });
      onEvent({ type: 'done' });
    });
    const domainAdapter = createDomainAdapter(buildRequest);

    const { result } = renderHook(() => useAgenticLoop({
      projectId: 'project-1',
      storageKey: 'preprocessing-restream',
      domainAdapter
    }));

    await act(async () => {
      await result.current.runLoop('Scale numeric columns', {
        model: 'gpt-5.4',
        reasoningEffort: 'high'
      });
    });

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(120);
      await Promise.resolve();
    });

    expect(buildRequest).toHaveBeenCalledTimes(2);

    const secondCall = buildRequest.mock.calls[1];
    expect(secondCall?.[1]).toEqual([
      expect.objectContaining({
        id: 'call-1',
        tool: 'propose_transformation_step'
      })
    ]);
    expect(secondCall?.[2]).toEqual([
      expect.objectContaining({
        id: 'call-1',
        tool: 'propose_transformation_step',
        output: expect.objectContaining({
          runId: 'prep-run-1',
          stepId: 'step-1'
        })
      })
    ]);
    expect(secondCall?.[5]).toMatchObject({
      continuation: true
    });

    expect(result.current.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'assistant_text',
        content: 'I will add a scaling step.'
      }),
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
      }),
      expect.objectContaining({
        type: 'assistant_text',
        content: 'Step proposed and ready for code generation.'
      })
    ]));
  });

  it('pauses instead of restreaming when tool execution reaches approval wait state', async () => {
    vi.useFakeTimers();
    executeToolCallsMock.mockResolvedValue({
      results: [
        {
          id: 'call-1',
          tool: 'propose_transformation_step',
          output: {
            runId: 'prep-run-1',
            stepId: 'step-1',
            status: 'awaiting_approval'
          }
        }
      ]
    });

    const buildRequest = vi.fn(async (_prompt, _toolCalls, _toolResults, onEvent) => {
      onEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind: 'preprocessing',
          message: 'This step needs approval before continuing.',
          controller: buildControllerSummary({
            currentNode: 'await_approval',
            allowTextResponse: true,
            requireToolCall: false,
            pendingApproval: true,
            allowedTools: []
          }),
          tool_calls: [
            {
              id: 'call-1',
              tool: 'propose_transformation_step',
              args: {
                title: 'Drop sparse column',
                intentType: 'drop_column'
              }
            }
          ]
        }
      });
    });
    const domainAdapter = createDomainAdapter(buildRequest);

    const { result } = renderHook(() => useAgenticLoop({
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(buildRequest).toHaveBeenCalledTimes(1);
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
  });

  it('passes domain-specific execution metadata through tool execution', async () => {
    executeToolCallsMock.mockResolvedValue({
      results: [
        {
          id: 'call-1',
          tool: 'commit_transformation_step',
          output: {
            runId: 'prep-run-1',
            stepId: 'step-1',
            status: 'applied'
          }
        }
      ]
    });

    const buildRequest = vi.fn(async (_prompt, _toolCalls, _toolResults, onEvent) => {
      onEvent({
        type: 'envelope',
        envelope: {
          version: '1',
          kind: 'preprocessing',
          message: 'Approving the pending step.',
          controller: buildControllerSummary({
            currentNode: 'commit',
            pendingApproval: true,
            allowedTools: ['commit_transformation_step']
          }),
          tool_calls: [
            {
              id: 'call-1',
              tool: 'commit_transformation_step',
              args: {
                stepId: 'step-1',
                approved: true
              }
            }
          ]
        }
      });
    });

    const domainAdapter = createDomainAdapter(buildRequest, {
      resolveToolExecutionRequest: () => ({
        datasetId: 'dataset-1',
        executionMode: 'user_approval'
      })
    });

    const { result } = renderHook(() => useAgenticLoop({
      projectId: 'project-1',
      storageKey: 'preprocessing-execution-metadata',
      domainAdapter
    }));

    await act(async () => {
      await result.current.runLoop('Approve it.', {
        model: 'gpt-5.4',
        reasoningEffort: 'medium'
      });
    });

    await waitFor(() => {
      expect(executeToolCallsMock).toHaveBeenCalledWith(
        'project-1',
        [
          expect.objectContaining({
            tool: 'commit_transformation_step'
          })
        ],
        undefined,
        'user_approval',
        'dataset-1'
      );
    });
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

    expect(result.current.messages).toEqual([
      expect.objectContaining({
        type: 'assistant_text',
        content: 'Stored preprocessing answer.'
      })
    ]);

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

    const { result } = renderHook(() => useAgenticLoop({
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
    expect(executeToolCallsMock).not.toHaveBeenCalled();
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
  });
});
