import { describe, expect, it } from 'vitest';

import './phases/featureEngineering.js';
import { resolveWorkflowNodeContract } from './contracts.js';
import type { WorkflowGraphState } from './graphState.js';

function createFeatureEngineeringState(): WorkflowGraphState {
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
      currentNode: 'plan_feature_pipeline',
      revision: 1,
      retryBudget: 3,
      repairAttemptCount: 0,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z'
    },
    request: {
      messages: [],
      tools: [
        {
          name: 'get_dataset_profile',
          description: 'Profile the active dataset.',
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'render_ui',
          description: 'Render final UI.',
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'ask_user',
          description: 'Ask user for clarification.',
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
    controllerSummary: {
      currentNode: 'plan_feature_pipeline'
    },
    iteration: 0,
    nextStep: 'invoke_model',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null
  };
}

describe('resolveWorkflowNodeContract', () => {
  it('requires an initial dataset profile for a brand new feature-engineering draft', () => {
    const contract = resolveWorkflowNodeContract(createFeatureEngineeringState());

    expect(contract).toMatchObject({
      mode: 'action',
      requireToolCall: true,
      allowAssistantMessage: false,
      allowAskUser: false,
      allowRenderUi: false
    });
    expect(contract.allowedTools.map((tool) => tool.name)).toEqual(['get_dataset_profile']);
  });

  it('allows summarize/render_ui behavior after the initial dataset profile step', () => {
    const state = createFeatureEngineeringState();
    state.run.currentNode = 'continue_feature_pipeline';
    state.controllerSummary = {
      currentNode: 'continue_feature_pipeline'
    };

    const contract = resolveWorkflowNodeContract(state);

    expect(contract).toMatchObject({
      mode: 'text',
      requireToolCall: false,
      allowAssistantMessage: true,
      allowAskUser: true,
      allowRenderUi: true
    });
    expect(contract.allowedTools).toEqual([]);
  });
});
