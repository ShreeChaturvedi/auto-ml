import { describe, expect, it } from 'vitest';

import type { WorkflowNodeContract } from './contracts.js';
import type { WorkflowGraphState } from './graphState.js';
import { buildPlannerRequest } from './plannerPrompt.js';

function createState(): WorkflowGraphState {
  return {
    turn: {
      projectId: 'project-1',
      phase: 'feature_engineering',
      prompt: 'Suggest candidate features.',
      datasetId: 'dataset-1'
    },
    run: {
      runId: 'run-1',
      threadId: 'thread-1',
      projectId: 'project-1',
      phase: 'feature_engineering',
      status: 'running',
      currentNode: 'continue_feature_pipeline',
      revision: 1,
      retryBudget: 3,
      repairAttemptCount: 0,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z'
    },
    request: {
      messages: [{ role: 'user', content: 'Suggest candidate features.' }],
      tools: [
        {
          name: 'propose_feature',
          description: 'Propose a feature.',
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'render_ui',
          description: 'Render final UI.',
          parameters: { type: 'object', properties: {} }
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
    controllerSummary: null,
    iteration: 1,
    nextStep: 'invoke_model',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null
  };
}

describe('buildPlannerRequest', () => {
  it('keeps tool_call available when tool calls are optional', () => {
    const contract: WorkflowNodeContract = {
      mode: 'action',
      allowedTools: [
        {
          name: 'propose_feature',
          description: 'Propose a feature.',
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'render_ui',
          description: 'Render final UI.',
          parameters: { type: 'object', properties: {} }
        }
      ],
      allowAssistantMessage: true,
      allowAskUser: true,
      allowRenderUi: true,
      allowPlanExit: false,
      requireToolCall: false
    };

    const request = buildPlannerRequest(createState(), contract);

    expect(request.messages[0]?.content).toContain('Allowed output kinds: tool_call, assistant_message, ask_user, render_ui.');
    expect(request.messages[0]?.content).toContain('tool_call is allowed when another tool step is still needed.');
  });

  it('omits tool_call when the node should only summarize or render UI', () => {
    const contract: WorkflowNodeContract = {
      mode: 'action',
      allowedTools: [],
      allowAssistantMessage: true,
      allowAskUser: true,
      allowRenderUi: true,
      allowPlanExit: false,
      requireToolCall: false
    };

    const request = buildPlannerRequest(createState(), contract);

    expect(request.messages[0]?.content).toContain('Allowed output kinds: assistant_message, ask_user, render_ui.');
    expect(request.messages[0]?.content).not.toContain('tool_call is allowed when another tool step is still needed.');
  });
});
