import { beforeEach, describe, expect, it, vi } from 'vitest';

import './phases/featureEngineering.js';

import type { LlmRequest, LlmStreamHandlers } from '../llm/llmClient.js';

import type { WorkflowGraphState } from './graphState.js';
import { invokeModelNode } from './modelTurnCollector.js';

const {
  createLlmClientMock,
  llmCompleteMock,
  llmStreamMock
} = vi.hoisted(() => ({
  createLlmClientMock: vi.fn(),
  llmCompleteMock: vi.fn(async () => ''),
  llmStreamMock: vi.fn(async () => '')
}));

vi.mock('../llm/llmClient.js', () => ({
  createLlmClient: createLlmClientMock
}));

function createBaseState(): WorkflowGraphState {
  return {
    turn: {
      projectId: 'project-1',
      phase: 'preprocessing',
      prompt: 'Profile missing values in subscriptions and propose a safe imputation step with validation checks.',
      datasetId: 'dataset-1'
    },
    run: {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      projectId: 'project-1',
      phase: 'preprocessing',
      status: 'running',
      currentNode: 'plan_step',
      revision: 1,
      retryBudget: 3,
      repairAttemptCount: 0,
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z'
    },
    request: {
      messages: [
        {
          role: 'system',
          content: 'Plan the next preprocessing step.'
        },
        {
          role: 'user',
          content: 'Inspect missing values in subscriptions and propose a safe imputation step.'
        }
      ],
      tools: [
        {
          name: 'propose_transformation_step',
          description: 'Propose a preprocessing step.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' }
            }
          }
        }
      ]
    },
    latestMessage: '',
    pendingToolCalls: [],
    toolCallHistory: [],
    toolResultHistory: [],
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    controllerSummary: {
      allowedTools: ['propose_transformation_step'],
      allowTextResponse: false,
      requireToolCall: true
    },
    iteration: 0,
    nextStep: 'invoke_model',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null
  };
}

describe('invokeModelNode', () => {
  const validPlanMarkdown = [
    '# Project Plan',
    '',
    '## Objective',
    'Forecast runtime prediction safely.',
    '',
    '## Data Summary',
    'Use the uploaded dataset profile and sample.',
    '',
    '## Approach',
    'Diagnose data quality risks before modeling.',
    '',
    '## Feature Engineering',
    'Only add features with validated signal.',
    '',
    '## Evaluation',
    'Measure accuracy and runtime tradeoffs.',
    '',
    '## Risks & Assumptions',
    'Unknown labels may need follow-up.',
    '',
    '## Next Steps',
    'Review the plan and proceed to analysis.'
  ].join('\n');

  beforeEach(() => {
    vi.clearAllMocks();
    createLlmClientMock.mockReturnValue({
      complete: llmCompleteMock,
      stream: llmStreamMock
    });
  });

  it('uses the structured planner for action nodes instead of the streamed tool loop', async () => {
    llmCompleteMock.mockResolvedValueOnce(JSON.stringify({
      kind: 'tool_call',
      toolName: 'propose_transformation_step',
      toolArgs: {
        title: 'Impute subscriptions missing values'
      }
    }));

    const result = await invokeModelNode(
      createBaseState(),
      {
        writableEnded: false,
        destroyed: false,
        write: vi.fn()
      } as never
    );

    expect(llmCompleteMock).toHaveBeenCalledTimes(1);
    expect(llmStreamMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      nextStep: 'execute_tools',
      pendingToolCalls: [
        expect.objectContaining({
          tool: 'propose_transformation_step',
          args: {
            title: 'Impute subscriptions missing values'
          }
        })
      ]
    });
  });

  it('accepts planner JSON responses with trailing non-JSON text', async () => {
    llmCompleteMock.mockResolvedValueOnce(
      `${JSON.stringify({
        kind: 'tool_call',
        toolName: 'propose_transformation_step',
        toolArgs: {
          title: 'Impute subscriptions missing values'
        }
      })}\nI chose the safest next action.`
    );

    const result = await invokeModelNode(
      createBaseState(),
      {
        writableEnded: false,
        destroyed: false,
        write: vi.fn()
      } as never
    );

    expect(result).toMatchObject({
      nextStep: 'execute_tools',
      pendingToolCalls: [
        expect.objectContaining({
          tool: 'propose_transformation_step',
          args: {
            title: 'Impute subscriptions missing values'
          }
        })
      ]
    });
  });

  it('uses streaming text generation for text-only nodes', async () => {
    const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
      handlers.onToken('Answer only.');
      return 'Answer only.';
    });
    createLlmClientMock.mockReturnValue({
      complete: llmCompleteMock,
      stream: streamMock
    });

    const state = createBaseState();
    state.controllerSummary = {
      allowedTools: [],
      allowTextResponse: true,
      requireToolCall: false
    };

    const result = await invokeModelNode(
      state,
      {
        writableEnded: false,
        destroyed: false,
        write: vi.fn()
      } as never
    );

    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(llmCompleteMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      latestMessage: 'Answer only.',
      nextStep: 'complete'
    });
  });

  it('retries once on empty stream output at iteration 0 and recovers a tool call', async () => {
    // Reasoning models can end their first stream after emitting only
    // reasoning tokens — retrying once almost always recovers. The retry
    // is bounded to the first iteration of the turn to prevent the
    // per-iteration amplification that caused sustained 429s before.
    const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
      if (streamMock.mock.calls.length === 1) {
        return '';
      }
      handlers.onToolCall?.({
        name: 'materialize_feature_code',
        args: { featureId: 'feat-1', code: 'df["feat_1"] = 1' }
      });
      return '';
    });
    createLlmClientMock.mockReturnValue({ complete: llmCompleteMock, stream: streamMock });

    const state = createBaseState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.currentNode = 'continue_feature_pipeline';
    state.controllerSummary = undefined;
    state.iteration = 0;
    state.request = {
      messages: [
        { role: 'system', content: 'Continue feature lifecycle.' },
        { role: 'user', content: 'Implement selected feature IDs.' }
      ],
      tools: [
        {
          name: 'materialize_feature_code',
          description: 'Attach code to a proposed feature.',
          parameters: {
            type: 'object',
            properties: {
              featureId: { type: 'string' },
              code: { type: 'string' }
            }
          }
        }
      ],
      toolChoice: 'any'
    };

    const result = await invokeModelNode(state);

    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      nextStep: 'execute_tools',
      pendingToolCalls: [expect.objectContaining({ tool: 'materialize_feature_code' })]
    });
  });

  it('does NOT retry on empty stream output after iteration 0 (prevents amplification)', async () => {
    // After the first iteration, empty output is rare and retrying
    // doubles per-iteration API calls (up to 24x per turn), so we surface
    // the failure immediately instead of retrying.
    const streamMock = vi.fn(async (): Promise<string> => '');
    createLlmClientMock.mockReturnValue({ complete: llmCompleteMock, stream: streamMock });

    const state = createBaseState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.currentNode = 'continue_feature_pipeline';
    state.controllerSummary = undefined;
    state.iteration = 3; // simulating a mid-turn iteration
    state.request = {
      messages: [
        { role: 'system', content: 'Continue feature lifecycle.' },
        { role: 'user', content: 'Implement selected feature IDs.' }
      ],
      tools: [
        {
          name: 'materialize_feature_code',
          description: 'Attach code to a proposed feature.',
          parameters: {
            type: 'object',
            properties: {
              featureId: { type: 'string' },
              code: { type: 'string' }
            }
          }
        }
      ],
      toolChoice: 'any'
    };

    const result = await invokeModelNode(state);

    // Exactly one stream call — no retry amplification at iteration > 0.
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      nextStep: 'fail',
      errorMessage: 'Model returned no actionable workflow output.'
    });
  });

  it('recovers plan_exit markdown from raw tool argument text when parsed args are empty', async () => {
    const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
      handlers.onToolCall?.({
        name: 'plan_exit',
        args: {},
        rawArgsText: JSON.stringify({
          planMarkdown: validPlanMarkdown,
          planName: 'runtime-plan'
        })
      });
      return '';
    });
    createLlmClientMock.mockReturnValue({
      complete: llmCompleteMock,
      stream: streamMock
    });

    const state = createBaseState();
    state.turn.phase = 'onboarding';
    state.request = {
      messages: [
        { role: 'system', content: 'Create a project plan.' },
        { role: 'user', content: 'Diagnose data quality risks and then propose the plan.' }
      ],
      tools: [
        {
          name: 'plan_exit',
          description: 'Finalize the plan.',
          parameters: {
            type: 'object',
            properties: {
              planName: { type: 'string' },
              planMarkdown: { type: 'string' }
            }
          }
        }
      ]
    };
    state.controllerSummary = undefined;

    const result = await invokeModelNode(state);

    expect(result).toMatchObject({
      nextStep: 'pause',
      planExitPayload: {
        planName: 'runtime-plan.md',
        planMarkdown: validPlanMarkdown
      }
    });
  });

  it('recovers plan_exit markdown from nested wrapper payloads', async () => {
    const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
      handlers.onToolCall?.({
        name: 'plan_exit',
        args: {
          payload: {
            plan: {
              markdown: validPlanMarkdown
            },
            name: 'nested-runtime-plan'
          }
        }
      });
      return '';
    });
    createLlmClientMock.mockReturnValue({
      complete: llmCompleteMock,
      stream: streamMock
    });

    const state = createBaseState();
    state.turn.phase = 'onboarding';
    state.request = {
      messages: [
        { role: 'system', content: 'Create a project plan.' },
        { role: 'user', content: 'Diagnose data quality risks and then propose the plan.' }
      ],
      tools: [
        {
          name: 'plan_exit',
          description: 'Finalize the plan.',
          parameters: {
            type: 'object',
            properties: {
              planName: { type: 'string' },
              planMarkdown: { type: 'string' }
            }
          }
        }
      ]
    };
    state.controllerSummary = undefined;

    const result = await invokeModelNode(state);

    expect(result).toMatchObject({
      nextStep: 'pause',
      planExitPayload: {
        planName: 'nested-runtime-plan.md',
        planMarkdown: validPlanMarkdown
      }
    });
  });

  describe('feature_engineering text-only stall detection', () => {
    // Regression: when 3 features are selected and the LLM emits text tokens
    // mid-loop ("I'll continue with feature 2...") but no tool call, the turn
    // would silently route to 'complete' because latestMessage.trim() counts
    // as actionable in hasActionableOutput. The frontend then re-fired the
    // same prompt, causing the loop the user saw.

    function createFeStallState(): WorkflowGraphState {
      const state = createBaseState();
      state.turn.phase = 'feature_engineering';
      state.run.phase = 'feature_engineering';
      state.run.currentNode = 'continue_feature_pipeline';
      state.controllerSummary = undefined;
      state.iteration = 5;
      state.turn.prompt = [
        'Implement the enabled features in the notebook.',
        '',
        'Selected feature IDs to implement: feat-1, feat-2, feat-3'
      ].join('\n');
      state.request = {
        messages: [
          { role: 'system', content: 'Continue feature lifecycle.' },
          { role: 'user', content: 'Implement selected feature IDs.' }
        ],
        tools: [
          {
            name: 'materialize_feature_code',
            description: 'Attach code to a proposed feature.',
            parameters: {
              type: 'object',
              properties: {
                featureId: { type: 'string' },
                code: { type: 'string' }
              }
            }
          }
        ],
        toolChoice: 'any'
      };
      // feat-1 already registered; feat-2 and feat-3 still outstanding.
      state.toolResultHistory = [
        {
          id: 'hist-1',
          tool: 'register_feature',
          output: { status: 'ok', featureId: 'feat-1', projectId: 'project-1' }
        }
      ] as never;
      return state;
    }

    it('retries once with a hardened directive when FE emits text-only with unfinished features', async () => {
      const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
        if (streamMock.mock.calls.length === 1) {
          // First stream: text only, no tool call — the stall.
          handlers.onToken('Continuing with feature 2 now...');
          return 'Continuing with feature 2 now...';
        }
        // Retry: emit a tool call for the next feature.
        handlers.onToolCall?.({
          name: 'materialize_feature_code',
          args: { featureId: 'feat-2', code: 'df["feat_2"] = 1' }
        });
        return '';
      });
      createLlmClientMock.mockReturnValue({ complete: llmCompleteMock, stream: streamMock });

      const result = await invokeModelNode(createFeStallState());

      expect(streamMock).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({
        nextStep: 'execute_tools',
        pendingToolCalls: [expect.objectContaining({ tool: 'materialize_feature_code' })]
      });
      // The retry should have seen a request with an appended hardened instruction.
      const retryRequest = streamMock.mock.calls[1][0] as LlmRequest;
      const lastMessage = retryRequest.messages[retryRequest.messages.length - 1];
      expect(lastMessage.role).toBe('user');
      expect(lastMessage.content).toMatch(/CRITICAL/);
      expect(lastMessage.content).toMatch(/tool call/);
    });

    it('fails with a clear error when FE text-only stall persists after the retry', async () => {
      const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
        handlers.onToken('Still just text, no tool call.');
        return 'Still just text, no tool call.';
      });
      createLlmClientMock.mockReturnValue({ complete: llmCompleteMock, stream: streamMock });

      const result = await invokeModelNode(createFeStallState());

      expect(streamMock).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({
        errorMessage: expect.stringMatching(/stalled.*selected features still need implementation/i),
        errorCode: 'MODEL_TOOL_OUTPUT_INVALID'
      });
    });

    it('does NOT trigger stall detection when phase is not feature_engineering', async () => {
      const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
        handlers.onToken('Just text in a non-FE phase.');
        return 'Just text in a non-FE phase.';
      });
      createLlmClientMock.mockReturnValue({ complete: llmCompleteMock, stream: streamMock });

      const state = createFeStallState();
      state.turn.phase = 'preprocessing';
      state.run.phase = 'preprocessing';
      // Force the streaming path for this test (non-FE phases normally use the
      // structured planner, but we want to verify the stall detection guard
      // does not fire when phase is anything other than feature_engineering).
      state.controllerSummary = {
        allowedTools: [],
        allowTextResponse: true,
        requireToolCall: false
      };

      await invokeModelNode(state);

      // Exactly one stream call — no stall retry for non-FE phases.
      expect(streamMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT trigger stall detection when no selected feature IDs are present', async () => {
      const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
        handlers.onToken('Proposing features now...');
        return 'Proposing features now...';
      });
      createLlmClientMock.mockReturnValue({ complete: llmCompleteMock, stream: streamMock });

      const state = createFeStallState();
      state.turn.prompt = 'Propose 3 features for this dataset.';
      state.toolResultHistory = [];

      await invokeModelNode(state);

      expect(streamMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT trigger stall detection when all selected features are already registered', async () => {
      const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
        handlers.onToken('All features are done. Checkpointing next.');
        return 'All features are done. Checkpointing next.';
      });
      createLlmClientMock.mockReturnValue({ complete: llmCompleteMock, stream: streamMock });

      const state = createFeStallState();
      state.toolResultHistory = [
        { id: 'h1', tool: 'register_feature', output: { status: 'ok', featureId: 'feat-1' } },
        { id: 'h2', tool: 'register_feature', output: { status: 'ok', featureId: 'feat-2' } },
        { id: 'h3', tool: 'register_feature', output: { status: 'ok', featureId: 'feat-3' } }
      ] as never;

      await invokeModelNode(state);

      expect(streamMock).toHaveBeenCalledTimes(1);
    });

    it('treats a rejected feature as terminal (does not retry for it)', async () => {
      const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
        handlers.onToken('Feat-2 was rejected. Moving on.');
        return 'Feat-2 was rejected. Moving on.';
      });
      createLlmClientMock.mockReturnValue({ complete: llmCompleteMock, stream: streamMock });

      const state = createFeStallState();
      // feat-1 registered, feat-2 rejected, feat-3 still open — stall should retry because feat-3 remains.
      state.toolResultHistory = [
        { id: 'h1', tool: 'register_feature', output: { status: 'ok', featureId: 'feat-1' } },
        { id: 'h2', tool: 'register_feature', output: { status: 'rejected', featureId: 'feat-2' } }
      ] as never;

      await invokeModelNode(state);

      // feat-3 still outstanding → retry should fire.
      expect(streamMock).toHaveBeenCalledTimes(2);
    });
  });
});
