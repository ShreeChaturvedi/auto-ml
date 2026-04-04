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

  it('retries once when streamed output is empty and recovers a tool call on the second attempt', async () => {
    const streamMock = vi.fn(async (_request: LlmRequest, handlers: LlmStreamHandlers) => {
      if (streamMock.mock.calls.length === 1) {
        return '';
      }
      handlers.onToolCall?.({
        name: 'materialize_feature_code',
        args: {
          featureId: 'feat-1',
          code: 'df["feat_1"] = 1'
        }
      });
      return '';
    });
    createLlmClientMock.mockReturnValue({
      complete: llmCompleteMock,
      stream: streamMock
    });

    const state = createBaseState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.currentNode = 'continue_feature_pipeline';
    state.controllerSummary = undefined;
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
      pendingToolCalls: [
        expect.objectContaining({
          tool: 'materialize_feature_code'
        })
      ]
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
});
