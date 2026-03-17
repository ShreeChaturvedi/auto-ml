import { beforeEach, describe, expect, it, vi } from 'vitest';


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
});
