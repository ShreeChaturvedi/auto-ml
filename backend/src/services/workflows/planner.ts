import type { LlmClient } from '../llm/llmClient.js';

import type { WorkflowNodeContract } from './contracts.js';
import type { WorkflowGraphState } from './graphState.js';
import { parsePlannerResponse, validatePlan } from './plannerAction.js';
import { planCodeMaterialization } from './plannerCode.js';
import { planExecutionRecordingAction } from './plannerExecution.js';
import { planNotebookBindingAction } from './plannerNotebook.js';
import { buildPlannerRequest } from './plannerPrompt.js';
import { planValidationAction } from './plannerValidation.js';

function buildPlannerFailure(message: string, code: string): Partial<WorkflowGraphState> {
  return {
    nextStep: 'fail',
    errorCode: code,
    errorMessage: message
  };
}

export async function planWorkflowAction(
  client: LlmClient,
  state: WorkflowGraphState,
  contract: WorkflowNodeContract
): Promise<Partial<WorkflowGraphState>> {
  if (state.turn.phase === 'preprocessing' && state.controllerSummary?.currentNode === 'generate_code') {
    return planCodeMaterialization(client, state);
  }
  if (state.turn.phase === 'preprocessing' && state.controllerSummary?.currentNode === 'write_code') {
    return planNotebookBindingAction(state);
  }
  if (state.turn.phase === 'preprocessing' && state.controllerSummary?.currentNode === 'record_execution') {
    return planExecutionRecordingAction(state);
  }
  if (state.turn.phase === 'preprocessing' && state.controllerSummary?.currentNode === 'validate') {
    return planValidationAction(state);
  }

  let parsedPlan;

  try {
    const raw = await client.complete(buildPlannerRequest(state, contract));
    parsedPlan = parsePlannerResponse(raw);
  } catch (error) {
    return buildPlannerFailure(
      error instanceof Error
        ? `Workflow planner did not return a valid action plan: ${error.message}`
        : 'Workflow planner did not return a valid action plan.',
      'WORKFLOW_PLAN_INVALID'
    );
  }

  const validated = validatePlan(parsedPlan, contract);
  if (validated.error) {
    return buildPlannerFailure(validated.error, 'WORKFLOW_PLAN_REJECTED');
  }

  if (validated.toolCall) {
    return {
      pendingToolCalls: [validated.toolCall],
      latestMessage: '',
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      nextStep: 'execute_tools',
      errorMessage: null,
      errorCode: null
    };
  }

  if (validated.askUserPayload) {
    return {
      askUserPayload: validated.askUserPayload,
      latestMessage: '',
      planExitPayload: null,
      uiPayload: null,
      nextStep: 'pause',
      errorMessage: null,
      errorCode: null
    };
  }

  if (validated.planExitPayload) {
    return {
      planExitPayload: validated.planExitPayload,
      latestMessage: '',
      askUserPayload: null,
      uiPayload: null,
      nextStep: 'pause',
      errorMessage: null,
      errorCode: null
    };
  }

  if (validated.uiPayload) {
    return {
      uiPayload: validated.uiPayload,
      latestMessage: '',
      askUserPayload: null,
      planExitPayload: null,
      nextStep: 'complete',
      errorMessage: null,
      errorCode: null
    };
  }

  return {
    latestMessage: validated.message ?? '',
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    nextStep: 'complete',
    errorMessage: null,
    errorCode: null
  };
}
