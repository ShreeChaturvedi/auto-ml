import { describe, expect, it } from 'vitest';

import type { WorkflowNodeContract } from './contracts.js';
import type { WorkflowGraphState } from './graphState.js';
import { buildPlannerRequest } from './plannerPrompt.js';

// Use the exact thread-id shape from the sprint10 live bug
// (workflow baa7e743-... / project 14be1dad-...) so the threadId-leak
// regression guard assertions match the real leaked value format.
const LIVE_BUG_THREAD_ID = 'thread-9adbfc59-9ef3-48ff-9201-9dc4e3f30ec9';

function createState(overrides: Partial<WorkflowGraphState> = {}): WorkflowGraphState {
  return {
    turn: {
      projectId: 'project-1',
      phase: 'feature_engineering',
      prompt: 'Suggest candidate features.',
      datasetId: 'dataset-1'
    },
    run: {
      runId: 'run-1',
      threadId: LIVE_BUG_THREAD_ID,
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
    errorCode: null,
    ...overrides
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

  describe('threadId leak regression guard', () => {
    // Sprint10 Training bug: the planner pulled state.run.threadId from the
    // 'Workflow thread: ...' line in summarizeWorkflowState and passed it as
    // the experimentId arg to propose_training_plan, producing
    // "Experiment thread-9adbfc59-... not found. Call configure_experiment
    // first." See plannerPrompt.ts fix commit 52c4b2d.

    const contract: WorkflowNodeContract = {
      mode: 'action',
      allowedTools: [
        {
          name: 'propose_training_plan',
          description: 'Propose training plan.',
          parameters: { type: 'object', properties: {} }
        }
      ],
      allowAssistantMessage: true,
      allowAskUser: true,
      allowRenderUi: false,
      allowPlanExit: false,
      requireToolCall: true
    };

    it('does not leak the workflow threadId into the planner system prompt', () => {
      const request = buildPlannerRequest(createState(), contract);
      for (const message of request.messages) {
        expect(message.content).not.toContain(LIVE_BUG_THREAD_ID);
        expect(message.content).not.toMatch(/Workflow thread:/i);
      }
    });

    it('does not leak the workflow threadId into the planner user prompt', () => {
      const request = buildPlannerRequest(createState(), contract);
      const userMessage = request.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).toBeDefined();
      expect(userMessage?.content).not.toContain(LIVE_BUG_THREAD_ID);
      expect(userMessage?.content).not.toMatch(/Workflow thread:/i);
    });
  });

  describe('tool-result payload surfaces domain ids', () => {
    // Without these ids in the summary, the planner had nothing to pass as
    // experimentId on iteration 2 and fell back to the leaked threadId.

    const contract: WorkflowNodeContract = {
      mode: 'action',
      allowedTools: [
        {
          name: 'propose_training_plan',
          description: 'Propose training plan.',
          parameters: { type: 'object', properties: {} }
        }
      ],
      allowAssistantMessage: true,
      allowAskUser: true,
      allowRenderUi: false,
      allowPlanExit: false,
      requireToolCall: true
    };

    it('surfaces experimentId + experimentName from configure_experiment output', () => {
      const request = buildPlannerRequest(
        createState({
          toolResultHistory: [
            {
              tool: 'configure_experiment',
              output: {
                experimentId: 'exp-a14496b1-062a-4780-9262-fc607cf0eaf3',
                experimentName: 'usage_log1p_regularization_tuning',
                status: 'configured',
                modelType: 'elastic_net'
              }
            }
          ]
        }),
        contract
      );

      const userMessage = request.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).toContain('experimentId=exp-a14496b1-062a-4780-9262-fc607cf0eaf3');
      expect(userMessage?.content).toContain('experimentName=usage_log1p_regularization_tuning');
    });

    it('pairs featureId with featureStatus so rejected features cannot be confused with ok ones', () => {
      const request = buildPlannerRequest(
        createState({
          toolResultHistory: [
            {
              tool: 'register_feature',
              output: {
                featureId: 'feat-rejected-1',
                status: 'rejected'
              }
            }
          ]
        }),
        contract
      );

      const userMessage = request.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).toContain('featureId=feat-rejected-1');
      expect(userMessage?.content).toContain('featureStatus=rejected');
    });

    it('surfaces datasetId, notebookId, cellId when present', () => {
      const request = buildPlannerRequest(
        createState({
          toolResultHistory: [
            {
              tool: 'write_cell',
              output: {
                cellId: 'cell-1',
                notebookId: 'nb-1',
                datasetId: 'ds-1',
                status: 'success'
              }
            }
          ]
        }),
        contract
      );

      const userMessage = request.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).toContain('datasetId=ds-1');
      expect(userMessage?.content).toContain('notebookId=nb-1');
      expect(userMessage?.content).toContain('cellId=cell-1');
    });

    it('skips absent optional ids without emitting empty key=values', () => {
      const request = buildPlannerRequest(
        createState({
          toolResultHistory: [
            {
              tool: 'generic_tool',
              output: { status: 'ok' }
            }
          ]
        }),
        contract
      );

      const userMessage = request.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).not.toMatch(/experimentId=(?:,|$|\s)/);
      expect(userMessage?.content).not.toMatch(/notebookId=(?:,|$|\s)/);
    });
  });
});
