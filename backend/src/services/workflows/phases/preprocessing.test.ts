import { describe, expect, it, vi } from 'vitest';

import { env } from '../../../config.js';
import { createFilePreprocessingRunRepository } from '../../../repositories/preprocessingRunRepository.js';
import * as notebookService from '../../notebook/notebookService.js';
import type { WorkflowGraphState } from '../graphState.js';

import { inferPreprocessingActionNode } from './preprocessing/transition.js';
import { preprocessingPhaseConfig } from './preprocessing.js';

describe('preprocessingPhaseConfig', () => {
  it('routes failed execution status to validate to preserve existing behavior', () => {
    expect(inferPreprocessingActionNode([
      {
        id: 'result-1',
        tool: 'execute_transformation_step',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'failed',
          step: {
            stepId: 'step-1',
            status: 'failed',
            lastExecuteSucceeded: false
          }
        }
      }
    ])).toBe('validate');
  });

  it('routes failed validation status to commit when no approval pause is requested', () => {
    expect(inferPreprocessingActionNode([
      {
        id: 'result-2',
        tool: 'validate_step_result',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'failed',
          step: {
            stepId: 'step-1',
            status: 'failed',
            requiresApproval: false
          }
        }
      }
    ])).toBe('commit');
  });

  it('treats only the latest tool result as pending approval', () => {
    expect(inferPreprocessingActionNode([
      {
        id: 'result-3',
        tool: 'validate_step_result',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'awaiting_approval'
        }
      },
      {
        id: 'result-4',
        tool: 'commit_transformation_step',
        output: {
          runId: 'prep-run-1',
          stepId: 'step-1',
          status: 'applied'
        }
      }
    ])).toBe('summarize');
  });

  it('falls back to persisted preprocessing run state for deterministic validate actions', async () => {
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
    await runRepository.save({
      runId: 'prep-run-validate-fallback',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1',
      derivedDatasetIds: [],
      steps: {
        'step-1': {
          stepId: 'step-1',
          title: 'Clean NULL QUERY_TEXT values and standardize SUCCESS_FLG codes',
          intentType: 'clean_and_standardize',
          status: 'running',
          toolCallId: 'tool-call-1',
          code: 'print("step")',
          codeHash: 'hash-1',
          version: 2,
          cellIds: ['cell-1', 'cell-2', 'cell-3'],
          requiresApproval: false,
          lastExecuteSucceeded: true,
          lastValidateSucceeded: false,
          createdAt: '2026-04-03T00:00:00.000Z',
          updatedAt: '2026-04-03T00:00:00.000Z'
        }
      },
      checkpoints: [],
      events: [],
      createdAt: '2026-04-03T00:00:00.000Z',
      updatedAt: '2026-04-03T00:00:00.000Z'
    });

    const state = {
      turn: {
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        notebookId: 'notebook-1',
        prompt: undefined
      },
      run: {
        runId: 'workflow-run-1',
        threadId: 'workflow-thread-1',
        projectId: 'project-1',
        phase: 'preprocessing',
        status: 'running',
        currentNode: 'validate',
        revision: 1,
        retryBudget: 3,
        repairAttemptCount: 0,
        activeDatasetId: 'dataset-1',
        activeNotebookId: 'notebook-1',
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z'
      },
      request: null,
      latestMessage: '',
      pendingToolCalls: [],
      toolCallHistory: [],
      toolResultHistory: [
        {
          id: 'result-1',
          tool: 'execute_transformation_step',
          output: {
            runId: 'prep-run-validate-fallback',
            status: 'running'
          }
        }
      ],
      turnStartToolCallCount: 0,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      controllerSummary: {
        runId: 'prep-run-validate-fallback',
        activeStepId: 'step-1',
        currentNode: 'validate'
      },
      iteration: 0,
      nextStep: 'invoke_model',
      pendingInputKind: null,
      pauseReason: null,
      errorMessage: null,
      errorCode: null
    } as WorkflowGraphState;

    const stageConfig = preprocessingPhaseConfig.getStageConfig('validate');
    const toolCalls = await stageConfig.deterministicAction?.(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'validate_step_result',
        args: expect.objectContaining({
          runId: 'prep-run-validate-fallback',
          stepId: 'step-1',
          requiresApproval: false
        })
      })
    ]);
  });

  it('falls back to notebook execution status when run_cell output is missing from current turn context', async () => {
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
    await runRepository.save({
      runId: 'prep-run-record-fallback',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1',
      derivedDatasetIds: [],
      steps: {
        'step-2': {
          stepId: 'step-2',
          title: 'Clean NULL QUERY_TEXT values and standardize SUCCESS_FLG codes',
          intentType: 'data_cleaning',
          status: 'pending',
          toolCallId: 'tool-call-2',
          code: '# Cell 1\nprint("a")\n# Cell 2\nprint("b")\n# Cell 3\nprint("c")',
          codeHash: 'hash-2',
          version: 2,
          cellIds: [],
          requiresApproval: false,
          lastExecuteSucceeded: false,
          lastValidateSucceeded: false,
          createdAt: '2026-04-03T00:00:00.000Z',
          updatedAt: '2026-04-03T00:00:00.000Z'
        }
      },
      checkpoints: [],
      events: [],
      createdAt: '2026-04-03T00:00:00.000Z',
      updatedAt: '2026-04-03T00:00:00.000Z'
    });

    const readCellSpy = vi.spyOn(notebookService, 'readCell').mockResolvedValue({
      cellId: 'cell-3',
      notebookId: 'notebook-1',
      cellType: 'code',
      title: 'Cell 3',
      content: 'print("c")',
      position: 2,
      metadata: {},
      executionCount: 1,
      executionOrder: 3,
      executionStatus: 'success',
      executionDurationMs: 12,
      executedAt: new Date('2026-04-03T00:00:00.000Z'),
      isDirty: false,
      output: [{ type: 'text', content: 'done' }],
      outputRefs: [],
      lockedBy: null,
      lockedAt: null,
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
      updatedAt: new Date('2026-04-03T00:00:00.000Z')
    });

    const state = {
      turn: {
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        notebookId: 'notebook-1',
        prompt: undefined
      },
      run: {
        runId: 'workflow-run-2',
        threadId: 'workflow-thread-2',
        projectId: 'project-1',
        phase: 'preprocessing',
        status: 'running',
        currentNode: 'record_execution',
        revision: 1,
        retryBudget: 3,
        repairAttemptCount: 0,
        activeDatasetId: 'dataset-1',
        activeNotebookId: 'notebook-1',
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z'
      },
      request: null,
      latestMessage: '',
      pendingToolCalls: [],
      toolCallHistory: [],
      toolResultHistory: [
        {
          id: 'result-1',
          tool: 'write_cell',
          output: {
            cellId: 'cell-1'
          }
        },
        {
          id: 'result-2',
          tool: 'write_cell',
          output: {
            cellId: 'cell-2'
          }
        },
        {
          id: 'result-3',
          tool: 'write_cell',
          output: {
            cellId: 'cell-3'
          }
        }
      ],
      turnStartToolCallCount: 0,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      controllerSummary: {
        runId: 'prep-run-record-fallback',
        activeStepId: 'step-2',
        currentNode: 'record_execution'
      },
      iteration: 0,
      nextStep: 'invoke_model',
      pendingInputKind: null,
      pauseReason: null,
      errorMessage: null,
      errorCode: null
    } as WorkflowGraphState;

    const stageConfig = preprocessingPhaseConfig.getStageConfig('record_execution');
    const toolCalls = await stageConfig.deterministicAction?.(state);

    expect(readCellSpy).toHaveBeenCalledWith('cell-3');
    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'execute_transformation_step',
        args: expect.objectContaining({
          runId: 'prep-run-record-fallback',
          stepId: 'step-2',
          cellId: 'cell-3',
          cellIds: ['cell-1', 'cell-2', 'cell-3'],
          succeeded: true,
          stdout: 'done'
        })
      })
    ]);

    readCellSpy.mockRestore();
  });
});
