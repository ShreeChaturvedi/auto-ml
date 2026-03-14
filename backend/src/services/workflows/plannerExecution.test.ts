import { describe, expect, it } from 'vitest';

import type { ToolResult } from '../../types/llm.js';

import type { WorkflowGraphState } from './graphState.js';
import { planExecutionRecordingAction } from './plannerExecution.js';
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
    currentNode: 'record_execution',
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
      currentNode: 'record_execution'
    },
    iteration: 0,
    nextStep: 'invoke_model',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null
  };
}

describe('plannerExecution', () => {
  it('records the latest run_cell result deterministically', () => {
    const state = createState([
      {
        id: 'call-1',
        tool: 'materialize_step_code',
        output: {
          stepId: 'step-1',
          step: {
            stepId: 'step-1',
            version: 2,
            codeHash: 'hash-1',
            cellIds: ['cell-1']
          }
        }
      },
      {
        id: 'call-2',
        tool: 'run_cell',
        output: {
          status: 'success',
          stdout: 'done',
          stderr: '',
          cellId: 'cell-1'
        }
      }
    ]);

    const result = planExecutionRecordingAction(state);
    expect(result.pendingToolCalls?.[0]).toMatchObject({
      tool: 'execute_transformation_step',
      args: {
        runId: 'prep-1',
        stepId: 'step-1',
        cellId: 'cell-1',
        succeeded: true,
        stdout: 'done',
        stderr: ''
      }
    });
  });
});
