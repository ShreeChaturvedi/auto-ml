import { randomUUID } from 'node:crypto';

import { ToolCallSchema } from '../../types/llm.js';

import type { WorkflowGraphState } from './graphState.js';
import {
  extractLatestCellId,
  extractLatestStepNotebookContext,
  type StepNotebookContext
} from './preprocessingPlannerContext.js';

function buildPreprocessingMetadata(step: StepNotebookContext, datasetId: string): Record<string, unknown> {
  return {
    preprocessing: {
      runId: step.runId,
      stepId: step.stepId,
      toolCallId: step.toolCallId,
      version: step.version,
      codeHash: step.codeHash,
      datasetId,
      dataframeName: 'df'
    }
  };
}

function buildToolCall(tool: 'write_cell' | 'run_cell', args: Record<string, unknown>, rationale: string) {
  return ToolCallSchema.parse({
    id: `wf-call-${randomUUID()}`,
    tool,
    args,
    rationale
  });
}

export function planNotebookBindingAction(state: WorkflowGraphState): Partial<WorkflowGraphState> {
  const step = extractLatestStepNotebookContext(state);
  if (!step) {
    return {
      nextStep: 'fail',
      errorCode: 'WORKFLOW_NOTEBOOK_CONTEXT_MISSING',
      errorMessage: 'Notebook binding could not resolve the active preprocessing step.'
    };
  }
  if (!state.run.activeDatasetId) {
    return {
      nextStep: 'fail',
      errorCode: 'WORKFLOW_ACTIVE_DATASET_MISSING',
      errorMessage: 'Notebook binding requires an active dataset before preprocessing execution.'
    };
  }

  const latestTool = state.toolResultHistory.at(-1)?.tool;
  const latestCellId = extractLatestCellId(state.toolResultHistory);
  const boundCellId = latestCellId ?? step.cellIds[0] ?? null;
  const metadata = buildPreprocessingMetadata(step, state.run.activeDatasetId);

  if (latestTool === 'write_cell' && boundCellId) {
    return {
      pendingToolCalls: [
        buildToolCall(
          'run_cell',
          {
            cellId: boundCellId,
            metadata
          },
          `Execute notebook cell for preprocessing step ${step.stepId}.`
        )
      ],
      latestMessage: '',
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      nextStep: 'execute_tools',
      errorMessage: null,
      errorCode: null
    };
  }

  if (!step.code) {
    return {
      nextStep: 'fail',
      errorCode: 'WORKFLOW_NOTEBOOK_CODE_MISSING',
      errorMessage: 'Notebook binding could not find materialized code for the active preprocessing step.'
    };
  }

  return {
    pendingToolCalls: [
      buildToolCall(
        'write_cell',
        {
          ...(boundCellId ? { cellId: boundCellId } : {}),
          title: step.title,
          content: step.code,
          cellType: 'code',
          metadata
        },
        `${boundCellId ? 'Update' : 'Create'} notebook cell for preprocessing step ${step.stepId}.`
      )
    ],
    latestMessage: '',
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    nextStep: 'execute_tools',
    errorMessage: null,
    errorCode: null
  };
}
