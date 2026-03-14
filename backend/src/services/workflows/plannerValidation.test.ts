import { describe, expect, it } from 'vitest';

import type { ToolResult } from '../../types/llm.js';

import type { WorkflowGraphState } from './graphState.js';
import { planValidationAction } from './plannerValidation.js';
import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

function createState(toolResultHistory: ToolResult[]): WorkflowGraphState {
  const turn: WorkflowTurnRequest = {
    projectId: 'project-1',
    phase: 'preprocessing',
    datasetId: 'ds-1',
    prompt: 'Continue.'
  };

  const run: WorkflowRunState = {
    runId: 'wf-1',
    threadId: 'thread-1',
    projectId: 'project-1',
    phase: 'preprocessing',
    status: 'running',
    currentNode: 'validate',
    revision: 1,
    activeDatasetId: 'ds-1',
    retryBudget: 3,
    repairAttemptCount: 0,
    createdAt: '2026-03-13T00:00:00.000Z',
    updatedAt: '2026-03-13T00:00:00.000Z'
  };

  return {
    turn,
    run,
    request: null,
    latestMessage: '',
    pendingToolCalls: [],
    toolCallHistory: [],
    toolResultHistory,
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    controllerSummary: {
      runId: 'prep-1',
      currentNode: 'validate'
    },
    iteration: 0,
    nextStep: 'invoke_model',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null
  };
}

describe('plannerValidation', () => {
  it('validates the active step deterministically', () => {
    const state = createState([
      {
        id: 'call-1',
        tool: 'execute_transformation_step',
        output: {
          stepId: 'step-1',
          status: 'running',
          step: {
            stepId: 'step-1',
            requiresApproval: true,
            cellIds: ['cell-1']
          }
        }
      },
      {
        id: 'call-2',
        tool: 'run_cell',
        output: {
          status: 'success',
          stderr: 'warning: mixed types'
        }
      }
    ]);

    const result = planValidationAction(state);
    expect(result.pendingToolCalls?.[0]).toMatchObject({
      tool: 'validate_step_result',
      args: {
        runId: 'prep-1',
        stepId: 'step-1',
        requiresApproval: true,
        notes: 'Notebook execution stderr: warning: mixed types'
      }
    });
  });
});
