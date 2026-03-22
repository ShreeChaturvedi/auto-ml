import { describe, expect, it, vi } from 'vitest';

import type { LlmClient } from '../llm/llmClient.js';

import type { WorkflowNodeContract } from './contracts.js';
import type { WorkflowGraphState } from './graphState.js';
import { planWorkflowAction } from './planner.js';

function createState(): WorkflowGraphState {
  return {
    turn: {
      projectId: 'project-1',
      phase: 'feature_engineering',
      prompt: 'Propose candidate features for churn prediction.',
      datasetId: 'dataset-1'
    },
    run: {
      runId: 'workflow-run-1',
      threadId: 'workflow-thread-1',
      projectId: 'project-1',
      phase: 'feature_engineering',
      status: 'running',
      currentNode: 'plan_feature_pipeline',
      revision: 1,
      retryBudget: 3,
      repairAttemptCount: 0,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z'
    },
    request: {
      messages: [
        {
          role: 'system',
          content: 'Plan the next feature engineering action.'
        },
        {
          role: 'user',
          content: 'Suggest safe candidate features.'
        }
      ],
      tools: [
        {
          name: 'propose_transformation_step',
          description: 'Propose a transformation step.',
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
      requireToolCall: false
    },
    iteration: 0,
    nextStep: 'invoke_model',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null
  };
}

function createContract(): WorkflowNodeContract {
  return {
    mode: 'action',
    allowedTools: [
      {
        name: 'propose_transformation_step',
        description: 'Propose a transformation step.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' }
          }
        }
      }
    ],
    allowAssistantMessage: true,
    allowAskUser: false,
    allowRenderUi: false,
    allowPlanExit: false,
    requireToolCall: false
  };
}

describe('planWorkflowAction', () => {
  it('repairs malformed planner output and continues', async () => {
    const complete = vi.fn<LlmClient['complete']>()
      .mockResolvedValueOnce('{"kind":"tool_call","toolName":"propose_transformation_step","toolArgs":{"title":"Impute')
      .mockResolvedValueOnce('{"kind":"tool_call","toolName":"propose_transformation_step","toolArgs":{"title":"Impute churn defaults"}}');

    const result = await planWorkflowAction(
      { complete, stream: vi.fn() } as unknown as LlmClient,
      createState(),
      createContract()
    );

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      nextStep: 'execute_tools',
      pendingToolCalls: [
        expect.objectContaining({
          tool: 'propose_transformation_step',
          args: {
            title: 'Impute churn defaults'
          }
        })
      ]
    });
  });

  it('fails with a planner error when repair output is still invalid', async () => {
    const complete = vi.fn<LlmClient['complete']>()
      .mockResolvedValueOnce('{"kind":"assistant_message","message":"unterminated')
      .mockResolvedValueOnce('still not json');

    const result = await planWorkflowAction(
      { complete, stream: vi.fn() } as unknown as LlmClient,
      createState(),
      createContract()
    );

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      nextStep: 'fail',
      errorCode: 'WORKFLOW_PLAN_INVALID'
    });
  });

  it('retries the planner once when the first response is empty', async () => {
    const complete = vi.fn<LlmClient['complete']>()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('{"kind":"tool_call","toolName":"propose_transformation_step","toolArgs":{"title":"Retry after empty response"}}');

    const result = await planWorkflowAction(
      { complete, stream: vi.fn() } as unknown as LlmClient,
      createState(),
      createContract()
    );

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      nextStep: 'execute_tools',
      pendingToolCalls: [
        expect.objectContaining({
          tool: 'propose_transformation_step',
          args: {
            title: 'Retry after empty response'
          }
        })
      ]
    });
  });
});
