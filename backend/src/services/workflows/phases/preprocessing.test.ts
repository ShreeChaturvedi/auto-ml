import { describe, expect, it, vi } from 'vitest';

import { env } from '../../../config.js';
import { createFilePreprocessingRunRepository } from '../../../repositories/preprocessingRunRepository.js';
import * as notebookService from '../../notebook/notebookService.js';
import type { WorkflowGraphState } from '../graphState.js';

const { datasetRepositoryMock } = vi.hoisted(() => ({
  datasetRepositoryMock: {
    getById: vi.fn()
  }
}));

vi.mock('../../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => datasetRepositoryMock)
}));

import { inferPreprocessingActionNode } from './preprocessing/transition.js';
import { buildPreprocessingCodeGenerationSystemPrompt, preprocessingPhaseConfig } from './preprocessing.js';

describe('preprocessingPhaseConfig', () => {
  datasetRepositoryMock.getById.mockReset();

  it('documents the guaranteed pandas/numpy imports for generated preprocessing code', () => {
    const prompt = buildPreprocessingCodeGenerationSystemPrompt();
    expect(prompt).toContain('import pandas as pd');
    expect(prompt).toContain('import numpy as np');
  });

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
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls?.[0]).toEqual(expect.objectContaining({
      tool: 'execute_transformation_step',
      args: expect.objectContaining({
        runId: 'prep-run-record-fallback',
        stepId: 'step-2',
        cellId: 'cell-3',
        cellIds: ['cell-1', 'cell-2', 'cell-3'],
        succeeded: true,
        stderr: ''
      })
    }));
    expect(String(toolCalls?.[0]?.args?.stdout ?? '')).toContain('done');

    readCellSpy.mockRestore();
  });

  it('treats a status-less run_cell result without tool error as successful execution', async () => {
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
    await runRepository.save({
      runId: 'prep-run-record-missing-status',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1',
      derivedDatasetIds: [],
      steps: {
        'step-3': {
          stepId: 'step-3',
          title: 'Encode SUBJECT_AREA_NAME and REPOSITORY_NAME',
          intentType: 'encode_categorical',
          status: 'pending',
          toolCallId: 'tool-call-3',
          code: '# Cell 1\nprint("encode")',
          codeHash: 'hash-3',
          version: 2,
          cellIds: ['cell-1'],
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
      cellId: 'cell-1',
      notebookId: 'notebook-1',
      cellType: 'code',
      title: 'Cell 1',
      content: 'print("encode")',
      position: 0,
      metadata: {},
      executionCount: null,
      executionOrder: null,
      executionStatus: null,
      executionDurationMs: null,
      executedAt: null,
      isDirty: false,
      output: [],
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
        runId: 'workflow-run-3',
        threadId: 'workflow-thread-3',
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
          id: 'write-result-1',
          tool: 'write_cell',
          output: {
            cellId: 'cell-1'
          }
        },
        {
          id: 'run-result-1',
          tool: 'run_cell',
          output: {
            _truncated: true,
            _originalSize: 999999,
            cellId: 'cell-1',
            stdout: ''
          }
        }
      ],
      turnStartToolCallCount: 0,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      controllerSummary: {
        runId: 'prep-run-record-missing-status',
        activeStepId: 'step-3',
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

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'execute_transformation_step',
        args: expect.objectContaining({
          runId: 'prep-run-record-missing-status',
          stepId: 'step-3',
          succeeded: true,
          cellIds: ['cell-1']
        })
      })
    ]);

    readCellSpy.mockRestore();
  });

  it('marks preprocessing execution as failed when any bound cell errors, even if the last cell succeeds', async () => {
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
    await runRepository.save({
      runId: 'prep-run-record-partial-failure',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1',
      derivedDatasetIds: [],
      steps: {
        'step-5': {
          stepId: 'step-5',
          title: 'Clean data',
          intentType: 'data_cleaning',
          status: 'pending',
          toolCallId: 'tool-call-5',
          code: '# Cell 1\nprint("a")\n# Cell 2\nprint("b")\n# Cell 3\nprint("c")',
          codeHash: 'hash-5',
          version: 2,
          cellIds: ['cell-1', 'cell-2', 'cell-3'],
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

    const state = {
      turn: {
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        notebookId: 'notebook-1',
        prompt: undefined
      },
      run: {
        runId: 'workflow-run-5',
        threadId: 'workflow-thread-5',
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
          id: 'write-result-1',
          tool: 'write_cell',
          output: { cellId: 'cell-1' }
        },
        {
          id: 'write-result-2',
          tool: 'write_cell',
          output: { cellId: 'cell-2' }
        },
        {
          id: 'write-result-3',
          tool: 'write_cell',
          output: { cellId: 'cell-3' }
        },
        {
          id: 'run-result-1',
          tool: 'run_cell',
          output: {
            cellId: 'cell-1',
            status: 'success',
            stdout: 'phase 1'
          }
        },
        {
          id: 'run-result-2',
          tool: 'run_cell',
          output: {
            cellId: 'cell-2',
            status: 'error',
            stderr: 'NameError'
          }
        },
        {
          id: 'run-result-3',
          tool: 'run_cell',
          output: {
            cellId: 'cell-3',
            status: 'success',
            stdout: 'phase 3'
          }
        }
      ],
      turnStartToolCallCount: 0,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      controllerSummary: {
        runId: 'prep-run-record-partial-failure',
        activeStepId: 'step-5',
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

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'execute_transformation_step',
        args: expect.objectContaining({
          runId: 'prep-run-record-partial-failure',
          stepId: 'step-5',
          succeeded: false,
          stderr: 'NameError'
        })
      })
    ]);
  });

  it('infers successful execution from executed notebook cells even when executionStatus is missing', async () => {
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
    await runRepository.save({
      runId: 'prep-run-record-executed-without-status',
      projectId: 'project-1',
      activeDatasetId: 'dataset-1',
      derivedDatasetIds: [],
      steps: {
        'step-4': {
          stepId: 'step-4',
          title: 'Scale ROW_COUNT and NUM_DB_QUERY',
          intentType: 'scale_numeric_features',
          status: 'pending',
          toolCallId: 'tool-call-4',
          code: '# Cell 1\nprint("scale")',
          codeHash: 'hash-4',
          version: 2,
          cellIds: ['cell-1', 'cell-2', 'cell-3'],
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

    const cells = new Map([
      ['cell-1', {
        cellId: 'cell-1',
        notebookId: 'notebook-1',
        cellType: 'code',
        title: 'Cell 1',
        content: 'print("scale 1")',
        position: 0,
        metadata: {},
        executionCount: 1,
        executionOrder: 1,
        executionStatus: null,
        executionDurationMs: 100,
        executedAt: new Date('2026-04-03T00:00:00.000Z'),
        isDirty: false,
        output: [{ type: 'text', content: 'scaled 1' }],
        outputRefs: [],
        lockedBy: null,
        lockedAt: null,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        updatedAt: new Date('2026-04-03T00:00:00.000Z')
      }],
      ['cell-2', {
        cellId: 'cell-2',
        notebookId: 'notebook-1',
        cellType: 'code',
        title: 'Cell 2',
        content: 'print("scale 2")',
        position: 1,
        metadata: {},
        executionCount: 1,
        executionOrder: 2,
        executionStatus: null,
        executionDurationMs: 120,
        executedAt: new Date('2026-04-03T00:00:00.000Z'),
        isDirty: false,
        output: [{ type: 'text', content: 'scaled 2' }],
        outputRefs: [],
        lockedBy: null,
        lockedAt: null,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        updatedAt: new Date('2026-04-03T00:00:00.000Z')
      }],
      ['cell-3', {
        cellId: 'cell-3',
        notebookId: 'notebook-1',
        cellType: 'code',
        title: 'Cell 3',
        content: 'print("scale 3")',
        position: 2,
        metadata: {},
        executionCount: 1,
        executionOrder: 3,
        executionStatus: null,
        executionDurationMs: 140,
        executedAt: new Date('2026-04-03T00:00:00.000Z'),
        isDirty: false,
        output: [{ type: 'text', content: 'scaled 3' }],
        outputRefs: [],
        lockedBy: null,
        lockedAt: null,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        updatedAt: new Date('2026-04-03T00:00:00.000Z')
      }]
    ]);
    const readCellSpy = vi.spyOn(notebookService, 'readCell').mockImplementation(async (cellId: string) => {
      const cell = cells.get(cellId);
      if (!cell) {
        throw new Error(`Missing cell ${cellId}`);
      }
      return cell;
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
        runId: 'workflow-run-4',
        threadId: 'workflow-thread-4',
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
          id: 'write-result-1',
          tool: 'write_cell',
          output: { cellId: 'cell-1' }
        },
        {
          id: 'write-result-2',
          tool: 'write_cell',
          output: { cellId: 'cell-2' }
        },
        {
          id: 'write-result-3',
          tool: 'write_cell',
          output: { cellId: 'cell-3' }
        }
      ],
      turnStartToolCallCount: 0,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      controllerSummary: {
        runId: 'prep-run-record-executed-without-status',
        activeStepId: 'step-4',
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

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'execute_transformation_step',
        args: expect.objectContaining({
          runId: 'prep-run-record-executed-without-status',
          stepId: 'step-4',
          succeeded: true,
          cellId: 'cell-3',
          cellIds: ['cell-1', 'cell-2', 'cell-3']
        })
      })
    ]);

    readCellSpy.mockRestore();
  });

  it('creates a new notebook cell when a persisted bound cell id no longer exists', async () => {
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
    await runRepository.save({
      runId: 'prep-run-write-missing-cell',
      projectId: 'project-1',
      derivedDatasetIds: [],
      steps: {
        'step-5': {
          stepId: 'step-5',
          title: 'Encode SUBJECT_AREA_NAME and REPOSITORY_NAME',
          intentType: 'encoding',
          status: 'pending',
          toolCallId: 'tool-call-5',
          code: '# Cell 1\nprint("encode")',
          codeHash: 'hash-5',
          version: 2,
          cellIds: ['missing-cell-id'],
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

    const readCellSpy = vi.spyOn(notebookService, 'readCell').mockRejectedValue(new Error('Cell not found'));

    const state = {
      turn: {
        projectId: 'project-1',
        phase: 'preprocessing',
        datasetId: 'dataset-1',
        notebookId: 'notebook-1',
        prompt: undefined
      },
      run: {
        runId: 'workflow-run-5',
        threadId: 'workflow-thread-5',
        projectId: 'project-1',
        phase: 'preprocessing',
        status: 'running',
        currentNode: 'write_code',
        revision: 1,
        retryBudget: 3,
        repairAttemptCount: 0,
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
          tool: 'materialize_step_code',
          output: {
            runId: 'prep-run-write-missing-cell',
            stepId: 'step-5',
            step: {
              stepId: 'step-5',
              title: 'Encode SUBJECT_AREA_NAME and REPOSITORY_NAME',
              code: '# Cell 1\nprint("encode")',
              codeHash: 'hash-5',
              version: 2,
              requiresApproval: false,
              cellIds: ['missing-cell-id']
            }
          }
        }
      ],
      turnStartToolCallCount: 0,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      controllerSummary: {
        runId: 'prep-run-write-missing-cell',
        activeStepId: 'step-5',
        currentNode: 'write_code'
      },
      iteration: 0,
      nextStep: 'invoke_model',
      pendingInputKind: null,
      pauseReason: null,
      errorMessage: null,
      errorCode: null
    } as WorkflowGraphState;

    const stageConfig = preprocessingPhaseConfig.getStageConfig('write_code');
    const toolCalls = await stageConfig.deterministicAction?.(state);

    expect(readCellSpy).toHaveBeenCalledWith('missing-cell-id');
    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.not.objectContaining({
          cellId: 'missing-cell-id'
        })
      })
    ]);

    readCellSpy.mockRestore();
  });

  it('writes segmented preprocessing cells with guaranteed pandas imports before pd.get_dummies transforms', async () => {
    const projectId = 'project-preprocessing-segmented-imports';
    const dataset = {
      datasetId: 'dataset-segmented-imports',
      projectId,
      filename: 'customers.csv',
      fileType: 'csv',
      size: 128,
      nRows: 3,
      nCols: 2,
      columns: [
        { name: 'segment', dtype: 'object', nullable: false },
        { name: 'age', dtype: 'int64', nullable: false }
      ],
      sample: [
        { segment: 'consumer', age: 31 },
        { segment: 'enterprise', age: 44 }
      ],
      createdAt: '2026-04-03T00:00:00.000Z',
      updatedAt: '2026-04-03T00:00:00.000Z'
    };
    datasetRepositoryMock.getById.mockResolvedValue(dataset);

    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
    await runRepository.save({
      runId: 'prep-run-segmented-imports',
      projectId,
      activeDatasetId: dataset.datasetId,
      derivedDatasetIds: [],
      steps: {
        'step-6': {
          stepId: 'step-6',
          title: 'Encode segment labels',
          intentType: 'encoding',
          status: 'running',
          toolCallId: 'tool-call-6',
          code: '# Cell 1\ncat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()\nprint(cat_cols)\n\n# Cell 2\ndf = pd.get_dummies(df, columns=cat_cols, drop_first=False)\n\n# Cell 3\nprint(df.shape)',
          codeHash: 'hash-6',
          version: 2,
          cellIds: ['cell-1'],
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

    const state = {
      turn: {
        projectId,
        phase: 'preprocessing',
        datasetId: dataset.datasetId,
        notebookId: 'notebook-1',
        prompt: undefined
      },
      run: {
        runId: 'workflow-run-6',
        threadId: 'workflow-thread-6',
        projectId,
        phase: 'preprocessing',
        status: 'running',
        currentNode: 'write_code',
        revision: 1,
        retryBudget: 3,
        repairAttemptCount: 0,
        activeDatasetId: dataset.datasetId,
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
          tool: 'materialize_step_code',
          output: {
            runId: 'prep-run-segmented-imports',
            stepId: 'step-6',
            step: {
              stepId: 'step-6',
              title: 'Encode segment labels',
              code: '# Cell 1\ncat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()\nprint(cat_cols)\n\n# Cell 2\ndf = pd.get_dummies(df, columns=cat_cols, drop_first=False)\n\n# Cell 3\nprint(df.shape)',
              codeHash: 'hash-6',
              version: 2,
              requiresApproval: false,
              cellIds: ['cell-1']
            }
          }
        },
        {
          id: 'result-2',
          tool: 'write_cell',
          output: {
            cellId: 'cell-1'
          }
        },
        {
          id: 'result-3',
          tool: 'run_cell',
          output: {
            cellId: 'cell-1',
            status: 'success',
            stdout: 'ok',
            stderr: ''
          }
        }
      ],
      turnStartToolCallCount: 0,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      controllerSummary: {
        runId: 'prep-run-segmented-imports',
        activeStepId: 'step-6',
        currentNode: 'write_code'
      },
      iteration: 0,
      nextStep: 'invoke_model',
      pendingInputKind: null,
      pauseReason: null,
      errorMessage: null,
      errorCode: null
    } as WorkflowGraphState;

    const stageConfig = preprocessingPhaseConfig.getStageConfig('write_code');
    const toolCalls = await stageConfig.deterministicAction?.(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          title: 'Encode segment labels (2/3)',
          content: expect.stringContaining('df = pd.get_dummies(df, columns=cat_cols, drop_first=False)')
        })
      })
    ]);
    expect(String(toolCalls?.[0]?.args?.content ?? '')).toContain('import pandas as pd');
    expect(String(toolCalls?.[0]?.args?.content ?? '')).toContain('import numpy as np');
    expect(String(toolCalls?.[0]?.args?.content ?? '')).not.toContain('load_preprocessing_dataset(');
    expect(String(toolCalls?.[0]?.args?.content ?? '')).not.toContain('save_preprocessing_dataset(');
  });

  it('builds a deterministic commit action after validation using the active dataset and workbook notebook', async () => {
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
    await runRepository.save({
      runId: 'prep-run-commit-deterministic',
      projectId: 'project-1',
      activeDatasetId: 'dataset-derived-1',
      derivedDatasetIds: ['dataset-derived-1'],
      steps: {
        'step-4': {
          stepId: 'step-4',
          title: 'Commit cleaned dataset',
          intentType: 'data_cleaning',
          status: 'running',
          toolCallId: 'tool-call-4',
          code: '# Cell 1\nprint("commit")',
          codeHash: 'hash-4',
          version: 2,
          cellIds: ['cell-1'],
          requiresApproval: false,
          lastExecuteSucceeded: true,
          lastValidateSucceeded: true,
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
        runId: 'workflow-run-4',
        threadId: 'workflow-thread-4',
        projectId: 'project-1',
        phase: 'preprocessing',
        status: 'running',
        currentNode: 'commit',
        revision: 1,
        retryBudget: 3,
        repairAttemptCount: 0,
        activeDatasetId: 'dataset-derived-1',
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
          tool: 'validate_step_result',
          output: {
            runId: 'prep-run-commit-deterministic',
            stepId: 'step-4',
            status: 'running'
          }
        }
      ],
      turnStartToolCallCount: 0,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      controllerSummary: {
        runId: 'prep-run-commit-deterministic',
        activeStepId: 'step-4',
        currentNode: 'commit'
      },
      iteration: 0,
      nextStep: 'invoke_model',
      pendingInputKind: null,
      pauseReason: null,
      errorMessage: null,
      errorCode: null
    } as WorkflowGraphState;

    const stageConfig = preprocessingPhaseConfig.getStageConfig('commit');
    const toolCalls = await stageConfig.deterministicAction?.(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'commit_transformation_step',
        args: expect.objectContaining({
          runId: 'prep-run-commit-deterministic',
          stepId: 'step-4',
          datasetId: 'dataset-derived-1',
          notebookId: 'notebook-1'
        })
      })
    ]);
  });

  it('falls back to a stable workflow-owned preprocessing run when explicit runId is invalid', async () => {
    const projectId = 'project-preprocessing-stable-run';
    const workflowRunId = 'workflow-run-preprocessing-stable';
    const expectedRunId = `prep-${workflowRunId}`;
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);

    const result = await preprocessingPhaseConfig.executePhaseSpecificTool(
      'list_checkpoints',
      {
        runId: 'run-short-preprocess'
      },
      {
        projectId,
        toolCallId: 'wf-call-prep-stable',
        rationale: 'List checkpoints for preprocessing.',
        run: {
          runId: workflowRunId,
          threadId: 'workflow-thread-preprocessing-stable',
          projectId,
          phase: 'preprocessing',
          status: 'running',
          currentNode: 'plan_step',
          revision: 1,
          retryBudget: 3,
          repairAttemptCount: 0,
          createdAt: '2026-04-03T00:00:00.000Z',
          updatedAt: '2026-04-03T00:00:00.000Z'
        },
        args: {
          runId: 'run-short-preprocess'
        },
        turn: {
          projectId,
          phase: 'preprocessing'
        }
      } as never
    );

    expect(result.error).not.toBeTruthy();
    expect(result.output).toMatchObject({
      runId: expectedRunId,
      isError: false
    });
    const storedRun = await runRepository.getById(expectedRunId);
    expect(storedRun?.projectId).toBe(projectId);
  });

  it('reuses the same workflow-owned preprocessing run across repeated hallucinated runIds', async () => {
    const projectId = 'project-preprocessing-run-reuse';
    const workflowRunId = 'workflow-run-preprocessing-reuse';
    const expectedRunId = `prep-${workflowRunId}`;
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);

    const ctx = {
      projectId,
      rationale: 'List checkpoints for preprocessing.',
      run: {
        runId: workflowRunId,
        threadId: 'workflow-thread-preprocessing-reuse',
        projectId,
        phase: 'preprocessing',
        status: 'running',
        currentNode: 'plan_step',
        revision: 1,
        retryBudget: 3,
        repairAttemptCount: 0,
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z'
      },
      args: {
        runId: 'run-short-preprocess'
      },
      turn: {
        projectId,
        phase: 'preprocessing'
      }
    };

    const first = await preprocessingPhaseConfig.executePhaseSpecificTool(
      'list_checkpoints',
      {
        runId: 'run-short-preprocess'
      },
      {
        ...ctx,
        toolCallId: 'wf-call-prep-reuse-1'
      } as never
    );
    const second = await preprocessingPhaseConfig.executePhaseSpecificTool(
      'list_checkpoints',
      {
        runId: 'run-short-preprocess'
      },
      {
        ...ctx,
        toolCallId: 'wf-call-prep-reuse-2'
      } as never
    );

    expect(first.output).toMatchObject({ runId: expectedRunId });
    expect(second.output).toMatchObject({ runId: expectedRunId });
    const runs = await runRepository.listByProjectId(projectId);
    expect(runs.filter((run) => run.runId === expectedRunId)).toHaveLength(1);
  });

  it('still rejects explicit preprocessing runIds that belong to another project', async () => {
    const projectId = 'project-preprocessing-local';
    const foreignProjectId = 'project-preprocessing-foreign';
    const foreignRunId = 'prep-foreign-project-run';
    const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);
    await runRepository.getOrCreate(foreignProjectId, foreignRunId);

    const result = await preprocessingPhaseConfig.executePhaseSpecificTool(
      'list_checkpoints',
      {
        runId: foreignRunId
      },
      {
        projectId,
        toolCallId: 'wf-call-prep-mismatch',
        rationale: 'List checkpoints for preprocessing.',
        run: {
          runId: 'workflow-run-preprocessing-mismatch',
          threadId: 'workflow-thread-preprocessing-mismatch',
          projectId,
          phase: 'preprocessing',
          status: 'running',
          currentNode: 'plan_step',
          revision: 1,
          retryBudget: 3,
          repairAttemptCount: 0,
          createdAt: '2026-04-03T00:00:00.000Z',
          updatedAt: '2026-04-03T00:00:00.000Z'
        },
        args: {
          runId: foreignRunId
        },
        turn: {
          projectId,
          phase: 'preprocessing'
        }
      } as never
    );

    expect(result.output).toMatchObject({
      runId: foreignRunId,
      isError: true,
      reasonCode: 'RUN_PROJECT_MISMATCH'
    });
    expect(result.error).toContain('belongs to another project');
  });
});
