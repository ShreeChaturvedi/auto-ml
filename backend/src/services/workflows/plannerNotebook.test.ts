import { describe, expect, it } from 'vitest';

import type { ToolResult } from '../../types/llm.js';

import type { WorkflowGraphState } from './graphState.js';
import { planNotebookBindingAction } from './plannerNotebook.js';
import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

function createState(toolResultHistory: ToolResult[]): WorkflowGraphState {
  const turn: WorkflowTurnRequest = {
    projectId: 'project-1',
    phase: 'preprocessing',
    datasetId: 'ds-1',
    prompt: 'Profile missing values.'
  };

  const run: WorkflowRunState = {
    runId: 'wf-1',
    threadId: 'thread-1',
    projectId: 'project-1',
    phase: 'preprocessing',
    status: 'running',
    currentNode: 'write_code',
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
      currentNode: 'write_code'
    },
    iteration: 0,
    nextStep: 'invoke_model',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null
  };
}

describe('plannerNotebook', () => {
  it('writes preprocessing cell metadata with dataset binding', () => {
    const state = createState([
      {
        id: 'call-1',
        tool: 'materialize_step_code',
        output: {
          stepId: 'step-1',
          step: {
            stepId: 'step-1',
            title: 'Impute subscriptions',
            code: 'df["subscriptions"] = df["subscriptions"].fillna(0)',
            version: 2,
            codeHash: 'hash-1',
            cellIds: []
          }
        }
      }
    ]);

    const result = planNotebookBindingAction(state);
    const call = result.pendingToolCalls?.[0];
    expect(call?.tool).toBe('write_cell');
    expect(call?.args?.metadata).toEqual({
      preprocessing: {
        runId: 'prep-1',
        stepId: 'step-1',
        toolCallId: undefined,
        version: 2,
        codeHash: 'hash-1',
        datasetId: 'ds-1',
        dataframeName: 'df'
      }
    });
  });

  it('runs an existing bound cell with the same preprocessing metadata', () => {
    const state = createState([
      {
        id: 'call-1',
        tool: 'materialize_step_code',
        output: {
          stepId: 'step-1',
          step: {
            stepId: 'step-1',
            title: 'Impute subscriptions',
            code: 'df["subscriptions"] = df["subscriptions"].fillna(0)',
            version: 2,
            codeHash: 'hash-1',
            cellIds: ['cell-1']
          }
        }
      },
      {
        id: 'call-2',
        tool: 'write_cell',
        output: {
          cellId: 'cell-1'
        }
      }
    ]);

    const result = planNotebookBindingAction(state);
    const call = result.pendingToolCalls?.[0];
    expect(call?.tool).toBe('run_cell');
    expect(call?.args?.cellId).toBe('cell-1');
    expect(call?.args?.metadata).toEqual({
      preprocessing: {
        runId: 'prep-1',
        stepId: 'step-1',
        toolCallId: undefined,
        version: 2,
        codeHash: 'hash-1',
        datasetId: 'ds-1',
        dataframeName: 'df'
      }
    });
  });
});
