import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDatasetById } = vi.hoisted(() => ({
  mockGetDatasetById: vi.fn()
}));

vi.mock('../../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    getById: mockGetDatasetById
  })
}));

import type { ToolResult } from '../../../types/llm.js';
import type { WorkflowGraphState } from '../graphState.js';

import { trainingPhaseConfig } from './training.js';

function makeToolResult(tool: string, overrides: Partial<ToolResult> = {}): ToolResult {
  return { tool, id: `call-${tool}`, ...overrides };
}

function makeRunCellSuccess(): ToolResult {
  return makeToolResult('run_cell', {
    output: {
      status: 'success',
      stdout: '__TRAIN_COMPLETE__|{"rmse":0.4321}\nRMSE: 0.4321',
      stderr: '',
      cellId: 'c-1',
      executionMs: 1200
    }
  });
}

function makeRunCellSuccessWithoutCompletionMarker(): ToolResult {
  return makeToolResult('run_cell', {
    output: { status: 'success', stdout: 'Loaded dataset.', stderr: '', cellId: 'c-1', executionMs: 1200 }
  });
}

function makeRunCellError(): ToolResult {
  return makeToolResult('run_cell', {
    output: { status: 'error', stdout: '', stderr: 'NameError: name "foo" is not defined', cellId: 'c-1' }
  });
}

function makeRunCellMcpError(): ToolResult {
  return makeToolResult('run_cell', { error: 'Cell not found: c-999' });
}

function makeWriteCellFailure(): ToolResult {
  return makeToolResult('write_cell', {
    error: 'Markdown cells are not allowed during training execution.'
  });
}

function makeExecuteTrainingSuccess(): ToolResult {
  return makeToolResult('execute_training', {
    output: { experimentId: 'exp-1', status: 'training', metrics: { rmse: 0.43 } }
  });
}

function makeExecuteTrainingFailed(): ToolResult {
  return makeToolResult('execute_training', {
    output: { experimentId: 'exp-1', status: 'failed', errorMessage: 'Training code failed.' }
  });
}

function makeExecuteTrainingHandlerError(): ToolResult {
  return makeToolResult('execute_training', { error: 'This operation requires experimentId.' });
}

function makeEvaluateResultsSuccess(): ToolResult {
  return makeToolResult('evaluate_results', {
    output: { experimentId: 'exp-1', status: 'evaluated', metrics: { rmse: 0.42 } }
  });
}

function makeEvaluateResultsError(): ToolResult {
  return makeToolResult('evaluate_results', {
    error: 'evaluate_results requires non-empty numeric metrics'
  });
}

function makeRegisterModelSuccess(): ToolResult {
  return makeToolResult('register_model', {
    output: { experimentId: 'exp-1', status: 'registered', modelId: 'model-1' }
  });
}

function makeRegisterModelMetricsFailure(): ToolResult {
  return makeToolResult('register_model', {
    error: 'register_model requires non-empty numeric metrics.'
  });
}

function makeRegisterModelArtifactFailure(): ToolResult {
  return makeToolResult('register_model', {
    error: 'register_model could not locate the model artifact'
  });
}

function createTrainingState(toolResultHistory: ToolResult[]): WorkflowGraphState {
  return {
    run: {
      runId: 'run-1',
      threadId: 'thread-1',
      projectId: 'project-1',
      phase: 'training',
      status: 'running',
      currentNode: 'execute_training',
      metadata: {
        experiments: {
          'exp-1': {
            experimentId: 'exp-1',
            experimentName: 'ridge',
            modelType: 'ridge_regression',
            splitStrategy: 'time_series',
            hyperparameters: { alpha: 1.0 },
            updatedAt: '2026-04-09T00:00:00.000Z'
          }
        }
      }
    },
    turn: {
      projectId: 'project-1',
      phase: 'training',
      datasetId: 'dataset-1',
      targetColumn: 'usage_log1p'
    },
    toolResultHistory,
    toolCallHistory: [],
    turnStartToolCallCount: 0
  } as WorkflowGraphState;
}

beforeEach(() => {
  mockGetDatasetById.mockReset();
});

describe('trainingPhaseConfig.resolveNextStage', () => {
  const resolve = trainingPhaseConfig.resolveNextStage.bind(trainingPhaseConfig);

  describe('linear stage progression', () => {
    it('stays on configure_experiment until configuration succeeds', () => {
      expect(resolve('configure_experiment', [])).toBe('configure_experiment');
    });

    it('advances configure_experiment → propose_model after successful configuration', () => {
      expect(resolve('configure_experiment', [
        makeToolResult('configure_experiment', {
          output: {
            experimentId: 'exp-1',
            status: 'configured'
          }
        })
      ])).toBe('propose_model');
    });

    it('stays on propose_model until a proposal exists', () => {
      expect(resolve('propose_model', [])).toBe('propose_model');
    });

    it('stays on propose_model after proposal so approval routing can control codegen', () => {
      expect(resolve('propose_model', [
        makeToolResult('propose_training_plan', {
          output: {
            experimentId: 'exp-1',
            status: 'awaiting_approval'
          }
        })
      ])).toBe('propose_model');
    });

    it('advances generate_code → write_code', () => {
      expect(resolve('generate_code', [])).toBe('write_code');
    });

    it('returns null at summarize (end of lifecycle)', () => {
      expect(resolve('summarize', [])).toBeNull();
    });

    it('returns null for unknown stage', () => {
      expect(resolve('nonexistent_stage', [])).toBeNull();
    });
  });

  describe('generate_code stage gate', () => {
    it('stays at generate_code when the latest notebook execution failed', () => {
      expect(resolve('generate_code', [
        makeToolResult('write_cell', { output: { cellId: 'c-1' } }),
        makeRunCellError()
      ])).toBe('generate_code');
    });

    it('advances generate_code → write_code after a successful dependency install', () => {
      expect(resolve('generate_code', [
        makeToolResult('write_cell', { output: { cellId: 'c-1' } }),
        makeRunCellError(),
        makeToolResult('install_package', { output: { success: true, message: 'ok' } })
      ])).toBe('write_code');
    });

    it('stays at generate_code after install-only turn with no draft yet (CatBoost case)', () => {
      expect(resolve('generate_code', [
        makeToolResult('install_package', { output: { success: true, message: 'Successfully installed catboost' } })
      ])).toBe('generate_code');
    });

    it('stays at generate_code after install-only turn with no draft yet (pytorch-tabular case)', () => {
      expect(resolve('generate_code', [
        makeToolResult('install_package', { output: { success: true, message: 'Successfully installed pytorch-tabular' } })
      ])).toBe('generate_code');
    });

    it('stays at generate_code after a failed install with no draft written', () => {
      expect(resolve('generate_code', [
        makeToolResult('install_package', { error: 'pip install failed' })
      ])).toBe('generate_code');
    });

    it('advances generate_code → write_code when install followed by a successful draft write_cell', () => {
      expect(resolve('generate_code', [
        makeToolResult('install_package', { output: { success: true, message: 'ok' } }),
        makeToolResult('write_cell', { output: { cellId: 'c-1' } })
      ])).toBe('write_code');
    });

    it('advances generate_code → write_code once repair succeeds (latest notebook run is success, despite earlier failures in history)', () => {
      expect(resolve('generate_code', [
        makeToolResult('write_cell', { output: { cellId: 'c-1' } }),
        makeToolResult('write_cell', { output: { cellId: 'c-2' } }),
        makeRunCellError(),
        makeToolResult('write_cell', { output: { cellId: 'c-2' } }),
        makeRunCellSuccessWithoutCompletionMarker(),
      ])).toBe('write_code');
    });
  });

  describe('write_code stage gate', () => {
    it('stays at write_code when no run_cell in history', () => {
      expect(resolve('write_code', [
        makeToolResult('write_cell', { output: { cellId: 'c-1' } })
      ])).toBe('write_code');
    });

    it('loops back to generate_code when run_cell failed (status: error)', () => {
      expect(resolve('write_code', [makeRunCellError()])).toBe('generate_code');
    });

    it('loops back to generate_code when run_cell had MCP-level error', () => {
      expect(resolve('write_code', [makeRunCellMcpError()])).toBe('generate_code');
    });

    it('loops back to generate_code when notebook write/edit failed before execution', () => {
      expect(resolve('write_code', [makeWriteCellFailure()])).toBe('generate_code');
    });

    it('stays at write_code when run_cell succeeded but final training marker is missing', () => {
      expect(resolve('write_code', [makeRunCellSuccessWithoutCompletionMarker()])).toBe('write_code');
    });

    it('stays at write_code after a successful rerun resolves an earlier notebook failure', () => {
      expect(resolve('write_code', [
        makeRunCellError(),
        makeToolResult('install_package', { output: { success: true, message: 'ok' } }),
        makeRunCellSuccessWithoutCompletionMarker()
      ])).toBe('write_code');
    });

    it('advances write_code → execute_training when run_cell succeeded', () => {
      expect(resolve('write_code', [makeRunCellSuccess()])).toBe('execute_training');
    });

    it('advances if run_cell succeeded earlier (cumulative history)', () => {
      expect(resolve('write_code', [
        makeToolResult('write_cell', { output: { cellId: 'c-1' } }),
        makeRunCellSuccess()
      ])).toBe('execute_training');
    });
  });

  describe('execute_training failure detection', () => {
    it('loops back to generate_code on handler error', () => {
      expect(resolve('execute_training', [
        makeExecuteTrainingHandlerError()
      ])).toBe('generate_code');
    });

    it('loops back to generate_code on output.status=failed', () => {
      expect(resolve('execute_training', [
        makeExecuteTrainingFailed()
      ])).toBe('generate_code');
    });

    it('advances execute_training → evaluate_results on success', () => {
      expect(resolve('execute_training', [
        makeExecuteTrainingSuccess()
      ])).toBe('evaluate_results');
    });

    it('stays at execute_training until execute_training result exists', () => {
      expect(resolve('execute_training', [
        makeRunCellSuccess()
      ])).toBe('execute_training');
    });

    it('does NOT loop back from a different stage', () => {
      expect(resolve('evaluate_results', [
        makeExecuteTrainingFailed()
      ])).toBe('evaluate_results');
    });
  });

  describe('evaluate_results stage gate', () => {
    it('stays at evaluate_results when evaluate_results failed', () => {
      expect(resolve('evaluate_results', [
        makeEvaluateResultsError()
      ])).toBe('evaluate_results');
    });

    it('advances evaluate_results → register_model on success', () => {
      expect(resolve('evaluate_results', [
        makeEvaluateResultsSuccess()
      ])).toBe('register_model');
    });
  });

  describe('register_model stage gate', () => {
    it('routes register_model metrics failure back to evaluate_results', () => {
      expect(resolve('register_model', [
        makeRegisterModelMetricsFailure()
      ])).toBe('evaluate_results');
    });

    it('routes register_model artifact failure back to write_code', () => {
      expect(resolve('register_model', [
        makeRegisterModelArtifactFailure()
      ])).toBe('write_code');
    });

    it('advances register_model → generate_code after registration success so additional approved experiments can continue', () => {
      expect(resolve('register_model', [
        makeRegisterModelSuccess()
      ])).toBe('generate_code');
    });
  });
});

describe('trainingPhaseConfig.getStageConfig', () => {
  it('uses delegated generation for generate_code, deterministic notebook/execution/evaluation stages, and text elsewhere', () => {
    const textStages = [
      'answer', 'configure_experiment', 'propose_model',
      'await_review', 'summarize'
    ];
    for (const stage of textStages) {
      const config = trainingPhaseConfig.getStageConfig(stage);
      expect(config.mode).toBe('text');
    }

    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    expect(generateCode.mode).toBe('llm_delegated');
    expect(typeof generateCode.delegatedAction).toBe('function');

    const writeCode = trainingPhaseConfig.getStageConfig('write_code');
    expect(writeCode.mode).toBe('deterministic');
    expect(typeof writeCode.deterministicAction).toBe('function');

    const executeTraining = trainingPhaseConfig.getStageConfig('execute_training');
    expect(executeTraining.mode).toBe('deterministic');
    expect(typeof executeTraining.deterministicAction).toBe('function');

    const evaluateResults = trainingPhaseConfig.getStageConfig('evaluate_results');
    expect(evaluateResults.mode).toBe('deterministic');
    expect(typeof evaluateResults.deterministicAction).toBe('function');

    const registerModel = trainingPhaseConfig.getStageConfig('register_model');
    expect(registerModel.mode).toBe('deterministic');
    expect(typeof registerModel.deterministicAction).toBe('function');
  });

  it('limits late-stage tools so summarize cannot re-open proposal flow', () => {
    const summarize = trainingPhaseConfig.getStageConfig('summarize');
    expect(summarize.allowedTools).toHaveLength(0);
  });

  it('allows notebook tools at write_code stage without execute_training', () => {
    const config = trainingPhaseConfig.getStageConfig('write_code');
    const toolNames = config.allowedTools.map((t) => t.name);
    expect(toolNames).not.toContain('propose_training_plan');
    expect(toolNames).toContain('write_cell');
    expect(toolNames).toContain('run_cell');
    expect(toolNames).not.toContain('list_cells');
    expect(toolNames).not.toContain('read_cell');
  });

  it('allows only execute_training at execute_training stage', () => {
    const config = trainingPhaseConfig.getStageConfig('execute_training');
    expect(config.allowedTools.map((t) => t.name)).toEqual(['execute_training']);
  });

  it('allows only evaluate_results at evaluate_results stage', () => {
    const config = trainingPhaseConfig.getStageConfig('evaluate_results');
    expect(config.allowedTools.map((t) => t.name)).toEqual(['evaluate_results']);
  });

  it('allows only register_model at register_model stage', () => {
    const config = trainingPhaseConfig.getStageConfig('register_model');
    expect(config.allowedTools.map((t) => t.name)).toEqual(['register_model']);
  });

  it('auto-builds execute_training from the completed training cell marker', async () => {
    const config = trainingPhaseConfig.getStageConfig('execute_training');
    const action = config.deterministicAction;
    expect(action).toBeTypeOf('function');

    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'c-1' } }),
      makeRunCellSuccess()
    ]);
    state.toolCallHistory = [
      {
        id: 'write-1',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              segmentIndex: 0,
              segments: [{ title: 'Cell 1', content: 'print("train")' }]
            }
          }
        }
      },
      { id: 'run-1', tool: 'run_cell', args: { cellId: 'c-1' } }
    ] as never;

    const toolCalls = await action!(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'execute_training',
        args: expect.objectContaining({
          experimentId: 'exp-1',
          succeeded: true,
          cellIds: ['c-1'],
          metrics: expect.objectContaining({ rmse: 0.4321 })
        })
      })
    ]);
  });

  it('builds execute_training from the latest draft instead of reusing a previous model completion in the same turn', async () => {
    const config = trainingPhaseConfig.getStageConfig('execute_training');
    const action = config.deterministicAction;
    expect(action).toBeTypeOf('function');

    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'old-cell' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: '__TRAIN_COMPLETE__|{"rmse":0.44}\nRMSE: 0.44',
          stderr: '',
          cellId: 'old-cell',
          executionMs: 1100
        }
      }),
      makeToolResult('register_model', {
        output: { experimentId: 'exp-1', status: 'registered', modelId: 'model-1' }
      }),
      makeToolResult('write_cell', { output: { cellId: 'new-cell' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: '__TRAIN_COMPLETE__|{"rmse":0.61}\nRMSE: 0.61',
          stderr: '',
          cellId: 'new-cell',
          executionMs: 900
        }
      })
    ]);
    state.turn.prompt = 'Approved. Proceed with training the selected model: lasso.';
    state.run.metadata = {
      experiments: {
        'exp-1': {
          experimentId: 'exp-1',
          experimentName: 'ridge',
          modelType: 'ridge_regression',
          status: 'registered',
          updatedAt: '2026-04-09T00:00:00.000Z'
        },
        'exp-2': {
          experimentId: 'exp-2',
          experimentName: 'lasso',
          modelType: 'linear_regression',
          status: 'proposed',
          updatedAt: '2026-04-09T00:00:01.000Z'
        }
      }
    };
    state.toolCallHistory = [
      {
        id: 'write-old',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              segmentIndex: 0,
              segments: [{ title: 'Old', content: 'print("old")' }]
            }
          }
        }
      },
      { id: 'run-old', tool: 'run_cell', args: { cellId: 'old-cell' } },
      { id: 'register-old', tool: 'register_model', args: { experimentId: 'exp-1' } },
      {
        id: 'write-new',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-2',
              experimentId: 'exp-2',
              segmentIndex: 0,
              segments: [{ title: 'New', content: 'print("new")' }]
            }
          }
        }
      },
      { id: 'run-new', tool: 'run_cell', args: { cellId: 'new-cell' } }
    ] as never;

    const toolCalls = await action!(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'execute_training',
        args: expect.objectContaining({
          experimentId: 'exp-2',
          cellIds: ['new-cell'],
          metrics: expect.objectContaining({ rmse: 0.61 })
        })
      })
    ]);
  });

  it('auto-builds evaluate_results from execute_training metrics', async () => {
    const config = trainingPhaseConfig.getStageConfig('evaluate_results');
    const action = config.deterministicAction;
    expect(action).toBeTypeOf('function');

    const toolCalls = await action!(createTrainingState([
      makeExecuteTrainingSuccess()
    ]));

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'evaluate_results',
        args: expect.objectContaining({
          experimentId: 'exp-1',
          metrics: expect.objectContaining({ rmse: 0.43 })
        })
      })
    ]);
  });

  it('auto-builds register_model from evaluated experiment metadata', async () => {
    const config = trainingPhaseConfig.getStageConfig('register_model');
    const action = config.deterministicAction;
    expect(action).toBeTypeOf('function');

    const state = createTrainingState([
      makeEvaluateResultsSuccess()
    ]);
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-1'].evaluationMetrics = {
      rmse: 0.42
    };

    const toolCalls = await action!(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'register_model',
        args: expect.objectContaining({
          experimentId: 'exp-1',
          modelName: 'ridge',
          modelType: 'ridge_regression',
          artifactPath: 'model.joblib',
          metrics: expect.objectContaining({ rmse: 0.42 })
        })
      })
    ]);
  });

  it('registers the executed algorithm when prep segments show a specific library-backed model', async () => {
    const config = trainingPhaseConfig.getStageConfig('register_model');
    const action = config.deterministicAction;
    expect(action).toBeTypeOf('function');

    const state = createTrainingState([
      makeEvaluateResultsSuccess()
    ]);
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-1'] = {
      experimentId: 'exp-1',
      experimentName: 'catboost baseline',
      modelType: 'gradient_boosting_classifier',
      splitStrategy: 'time_series',
      evaluationMetrics: { accuracy: 0.91, f1: 0.88 },
      workflowPrepSegments: [
        'from catboost import CatBoostClassifier',
        'model = CatBoostClassifier(iterations=200)'
      ],
      updatedAt: '2026-04-09T00:00:00.000Z'
    };

    const toolCalls = await action!(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'register_model',
        args: expect.objectContaining({
          experimentId: 'exp-1',
          modelName: 'catboost baseline',
          modelType: 'catboost',
          tags: ['baseline', 'time_series', 'catboost'],
        })
      })
    ]);
  });

  it('registers fttransformer when the training prep segments show FTTransformerConfig', async () => {
    const config = trainingPhaseConfig.getStageConfig('register_model');
    const action = config.deterministicAction;
    expect(action).toBeTypeOf('function');

    const state = createTrainingState([
      makeEvaluateResultsSuccess()
    ]);
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-1'] = {
      experimentId: 'exp-1',
      experimentName: 'fttransformer baseline',
      modelType: 'neural_network',
      splitStrategy: 'time_series',
      evaluationMetrics: { accuracy: 0.87, f1: 0.84 },
      workflowPrepSegments: [
        'from pytorch_tabular.models import FTTransformerConfig',
        'model_config = FTTransformerConfig(task="classification")'
      ],
      updatedAt: '2026-04-09T00:00:00.000Z'
    };

    const toolCalls = await action!(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'register_model',
        args: expect.objectContaining({
          experimentId: 'exp-1',
          modelType: 'fttransformer',
          tags: ['baseline', 'time_series', 'fttransformer'],
        })
      })
    ]);
  });

  it('auto-builds execute/evaluate/register for the next approved experiment after one model is already registered in the same turn', async () => {
    const state = createTrainingState([
      makeToolResult('execute_training', {
        output: { experimentId: 'exp-1', status: 'training', metrics: { rmse: 0.43 } }
      }),
      makeToolResult('evaluate_results', {
        output: { experimentId: 'exp-1', status: 'evaluated', metrics: { rmse: 0.42 } }
      }),
      makeToolResult('register_model', {
        output: { experimentId: 'exp-1', status: 'registered', modelId: 'model-1' }
      }),
      makeToolResult('write_cell', { output: { cellId: 'c-2' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: '__TRAIN_COMPLETE__|{"rmse":0.55}\nRMSE: 0.55',
          stderr: '',
          cellId: 'c-2',
          executionMs: 900
        }
      })
    ]);
    state.turn.prompt = 'Approved. Proceed with training the selected model: lasso.';
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments = {
      'exp-1': {
        experimentId: 'exp-1',
        experimentName: 'ridge',
        modelType: 'ridge_regression',
        splitStrategy: 'time_series',
        status: 'registered',
        evaluationMetrics: { rmse: 0.42 },
        artifactPath: 'model.joblib',
        updatedAt: '2026-04-09T00:00:00.000Z'
      },
      'exp-2': {
        experimentId: 'exp-2',
        experimentName: 'lasso',
        modelType: 'linear_regression',
        splitStrategy: 'time_series',
        status: 'proposed',
        updatedAt: '2026-04-09T00:00:01.000Z'
      }
    };
    state.toolCallHistory = [
      { id: 'execute-1', tool: 'execute_training', args: { experimentId: 'exp-1' } },
      { id: 'evaluate-1', tool: 'evaluate_results', args: { experimentId: 'exp-1' } },
      { id: 'register-1', tool: 'register_model', args: { experimentId: 'exp-1' } },
      {
        id: 'write-2',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-2',
              experimentId: 'exp-2',
              segmentIndex: 0,
              segments: [{ title: 'New', content: 'print("new")' }]
            }
          }
        }
      },
      { id: 'run-2', tool: 'run_cell', args: { cellId: 'c-2' } }
    ] as never;

    const executeAction = trainingPhaseConfig.getStageConfig('execute_training').deterministicAction!;
    const evaluateAction = trainingPhaseConfig.getStageConfig('evaluate_results').deterministicAction!;
    const registerAction = trainingPhaseConfig.getStageConfig('register_model').deterministicAction!;

    const executeCalls = await executeAction(state);
    expect(executeCalls).toEqual([
      expect.objectContaining({
        tool: 'execute_training',
        args: expect.objectContaining({
          experimentId: 'exp-2',
          succeeded: true,
          metrics: expect.objectContaining({ rmse: 0.55 })
        })
      })
    ]);

    state.toolResultHistory.push(makeToolResult('execute_training', {
      output: { experimentId: 'exp-2', status: 'training', metrics: { rmse: 0.55 } }
    }));
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-2'].trainingMetrics = { rmse: 0.55 };

    const evaluateCalls = await evaluateAction(state);
    expect(evaluateCalls).toEqual([
      expect.objectContaining({
        tool: 'evaluate_results',
        args: expect.objectContaining({
          experimentId: 'exp-2',
          metrics: expect.objectContaining({ rmse: 0.55 })
        })
      })
    ]);

    state.toolResultHistory.push(makeToolResult('evaluate_results', {
      output: { experimentId: 'exp-2', status: 'evaluated', metrics: { rmse: 0.54 } }
    }));
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-2'].evaluationMetrics = { rmse: 0.54 };

    const registerCalls = await registerAction(state);
    expect(registerCalls).toEqual([
      expect.objectContaining({
        tool: 'register_model',
        args: expect.objectContaining({
          experimentId: 'exp-2',
          modelName: 'lasso',
          modelType: 'linear_regression',
          metrics: expect.objectContaining({ rmse: 0.54 })
        })
      })
    ]);
  });

  it('repairs a failed training cell by overwriting the existing cell with valid replacement code', async () => {
    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    const action = generateCode.delegatedAction;
    expect(action).toBeTypeOf('function');

    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'feature_v2.csv',
      columns: [
        { name: 'DATE', dtype: 'string' },
        { name: 'usage_log1p', dtype: 'number' }
      ]
    });

    const state = createTrainingState([
      makeToolResult('run_cell', {
        output: {
          status: 'error',
          stderr: 'DTypePromotionError: datetime64 could not be promoted by float64',
          cellId: 'cell-1'
        }
      })
    ]);
    state.run.currentNode = 'generate_code';
    state.toolCallHistory = [
      {
        tool: 'write_cell',
        args: {
          cellId: 'cell-1',
          title: 'Dataset Prep',
          content: 'df["DATE"] = pd.to_datetime(df["DATE"], errors="coerce")',
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              datasetId: 'dataset-1',
              datasetFilename: 'feature_v2.csv',
              targetColumn: 'usage_log1p',
              segmentIndex: 1,
              segments: [
                { title: 'Imports and Config', content: 'import pandas as pd' },
                { title: 'Dataset Prep', content: 'df["DATE"] = pd.to_datetime(df["DATE"], errors="coerce")' }
              ]
            }
          }
        }
      }
    ] as never;

    const client = {
      complete: vi.fn().mockResolvedValue('df["DATE"] = pd.to_datetime(df["DATE"], errors="coerce").map(lambda x: x.toordinal() if pd.notnull(x) else np.nan)')
    };

    const toolCalls = await action!(client as never, state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          cellId: 'cell-1',
          title: 'Dataset Prep',
          cellType: 'code',
          content: expect.stringContaining('toordinal'),
          metadata: expect.objectContaining({
            trainingDraft: expect.objectContaining({
              draftId: 'draft-1',
              segmentIndex: 1
            })
          })
        })
      })
    ]);
  });

  it('gives up cleanly after 3 failed repair attempts instead of looping to the recursion limit', async () => {
    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    const action = generateCode.delegatedAction;
    expect(action).toBeTypeOf('function');

    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'feature_v2.csv',
      columns: [
        { name: 'feat1', dtype: 'number' },
        { name: 'target', dtype: 'number' }
      ]
    });

    const state = createTrainingState([
      makeToolResult('run_cell', {
        output: {
          status: 'error',
          stderr: 'Training code cell is too large (117 lines).',
          cellId: 'cell-1'
        }
      })
    ]);
    state.run.currentNode = 'generate_code';
    state.toolCallHistory = [
      {
        tool: 'write_cell',
        args: {
          cellId: 'cell-1',
          title: 'Model Fit and Evaluation',
          content: 'pass',
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              datasetId: 'dataset-1',
              datasetFilename: 'feature_v2.csv',
              targetColumn: 'target',
              segmentIndex: 0,
              segments: [
                { title: 'Model Fit and Evaluation', content: 'pass' }
              ]
            }
          }
        }
      },
      { id: 'wf-call-auto-rewrite-training-draft-1-0', tool: 'write_cell', args: { cellId: 'cell-1' } },
      { id: 'wf-call-auto-rewrite-training-draft-1-0', tool: 'write_cell', args: { cellId: 'cell-1' } },
      { id: 'wf-call-auto-rewrite-training-draft-1-0', tool: 'write_cell', args: { cellId: 'cell-1' } }
    ] as never;

    const client = {
      complete: vi.fn(),
    };

    const toolCalls = await action!(client as never, state);

    expect(toolCalls).toEqual([]);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it('installs missing model libraries before attempting notebook-cell repair', async () => {
    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    const action = generateCode.delegatedAction;
    expect(action).toBeTypeOf('function');

    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'feature_v2.csv',
      columns: [
        { name: 'feat1', dtype: 'number' },
        { name: 'target', dtype: 'number' }
      ]
    });

    const state = createTrainingState([
      makeToolResult('run_cell', {
        output: {
          status: 'error',
          stderr: "ModuleNotFoundError: No module named 'catboost'",
          cellId: 'cell-1'
        }
      })
    ]);
    state.run.currentNode = 'generate_code';

    const client = {
      complete: vi.fn(),
    };

    const toolCalls = await action!(client as never, state);

    expect(client.complete).not.toHaveBeenCalled();
    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'install_package',
        args: {
          packageName: 'catboost',
        }
      })
    ]);
  });

  it('installs the transformer runtime dependency before writing FT-Transformer notebook cells', async () => {
    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    const action = generateCode.delegatedAction;
    expect(action).toBeTypeOf('function');

    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'feature_v2.csv',
      columns: [
        { name: 'feat1', dtype: 'number' },
        { name: 'target', dtype: 'number' }
      ]
    });

    const state = createTrainingState([]);
    state.run.currentNode = 'generate_code';
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-1'] = {
      experimentId: 'exp-1',
      experimentName: 'ft-transformer',
      modelType: 'fttransformer',
      splitStrategy: 'time_series',
      updatedAt: '2026-04-09T00:00:00.000Z'
    };

    const client = { complete: vi.fn() };

    const toolCalls = await action!(client as never, state);

    expect(client.complete).not.toHaveBeenCalled();
    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'install_package',
        args: {
          packageName: 'pytorch-tabular',
        }
      })
    ]);
  });

  it('passes configured hyperparameters and runtime-safe random-forest guidance into code generation', async () => {
    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    const action = generateCode.delegatedAction;
    expect(action).toBeTypeOf('function');

    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'Feature_v1.csv',
      columns: [
        { name: 'USER_NAME', dtype: 'string' },
        { name: 'usage_count', dtype: 'number' }
      ]
    });

    const state = createTrainingState([]);
    state.run.currentNode = 'generate_code';
    state.turn.prompt = 'Train a random forest on Feature_v1.csv';
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-1'] = {
      experimentId: 'exp-1',
      experimentName: 'feature_v1_random_forest_usage_count',
      modelType: 'random_forest_regressor',
      splitStrategy: 'time_series',
      featureColumns: ['USER_NAME'],
      hyperparameters: {
        n_estimators: 100,
        max_depth: 10,
        min_samples_leaf: 2,
        max_features: 'sqrt',
        random_state: 42
      },
      updatedAt: '2026-04-09T00:00:00.000Z'
    };

    const client = {
      complete: vi.fn().mockResolvedValue([
        '# Cell 1: Imports and Config',
        'import json',
        '# Cell 2: Dataset Prep',
        'print("prep")'
      ].join('\n'))
    };

    await action!(client as never, state);

    expect(client.complete).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Do NOT use max_depth=None unless the user explicitly requested it')
        }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Configured hyperparameters (authoritative): {"n_estimators":100,"max_depth":10,"min_samples_leaf":2,"max_features":"sqrt","random_state":42}')
        })
      ])
    }));
  });

  it('re-prompts code generation when a specific neural architecture is replaced with sklearn MLP code', async () => {
    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    const action = generateCode.delegatedAction;
    expect(action).toBeTypeOf('function');

    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'Feature_v1.csv',
      columns: [
        { name: 'subject_area', dtype: 'string' },
        { name: 'usage_count', dtype: 'number' },
        { name: 'is_power_user', dtype: 'number' }
      ]
    });

    const state = createTrainingState([]);
    state.run.currentNode = 'generate_code';
    state.turn.prompt = 'Train the approved TabTransformer candidate.';
    state.toolCallHistory = [
      { id: 'install-1', tool: 'install_package', args: { packageName: 'pytorch-tabular' } }
    ] as never;
    state.toolResultHistory = [
      makeToolResult('install_package', { output: { success: true, message: 'installed' } })
    ];
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-1'] = {
      experimentId: 'exp-1',
      experimentName: 'TabTransformer_TimeAware_Candidate',
      modelType: 'tabtransformer',
      splitStrategy: 'time_series',
      featureColumns: ['subject_area', 'usage_count'],
      updatedAt: '2026-04-09T00:00:00.000Z'
    };

    const client = {
      complete: vi.fn()
        .mockResolvedValueOnce([
          '# Cell 1: Imports and Config',
          'from sklearn.neural_network import MLPClassifier',
          '# Cell 2: Dataset Prep',
          'print("prep")'
        ].join('\n'))
        .mockResolvedValueOnce([
          '# Cell 1: Imports and Config',
          'from pytorch_tabular import TabularModel',
          'from pytorch_tabular.config import DataConfig, TrainerConfig, OptimizerConfig',
          'from pytorch_tabular.models import TabTransformerConfig',
          '# Cell 2: Dataset Prep',
          'print("prep")'
        ].join('\n'))
    };

    const toolCalls = await action!(client as never, state);

    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(client.complete.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Approved modelType "tabtransformer" was replaced with sklearn MLP code.')
        })
      ])
    }));
    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          content: expect.stringContaining('TabTransformerConfig')
        })
      })
    ]);
  });

  it('re-prompts code generation when regression code stratifies on y', async () => {
    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    const action = generateCode.delegatedAction;
    expect(action).toBeTypeOf('function');

    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'Feature_v1.csv',
      columns: [
        { name: 'feature_a', dtype: 'number' },
        { name: 'usage_count', dtype: 'number' }
      ]
    });

    const state = createTrainingState([]);
    state.run.currentNode = 'generate_code';
    state.turn.prompt = 'Train a linear regression model.';
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-1'] = {
      experimentId: 'exp-1',
      experimentName: 'linear regression baseline',
      modelType: 'linear_regression',
      taskType: 'regression',
      splitStrategy: 'train_test',
      featureColumns: ['feature_a'],
      updatedAt: '2026-04-09T00:00:00.000Z'
    };

    const client = {
      complete: vi.fn()
        .mockResolvedValueOnce([
          '# Cell 1: Imports and Config',
          'from sklearn.linear_model import LinearRegression',
          '# Cell 2: Dataset Prep',
          'stratify = y',
          'X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=stratify)',
        ].join('\n'))
        .mockResolvedValueOnce([
          '# Cell 1: Imports and Config',
          'from sklearn.linear_model import LinearRegression',
          '# Cell 2: Dataset Prep',
          'X_train, X_test, y_train, y_test = train_test_split(X, y, random_state=42)',
        ].join('\n'))
    };

    const toolCalls = await action!(client as never, state);

    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(client.complete.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Regression code must not stratify train/test splits on y.')
        })
      ])
    }));
    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          content: expect.not.stringContaining('stratify = y')
        })
      })
    ]);
  });

  it('re-prompts code generation when a classic estimator family is replaced with a proxy model', async () => {
    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    const action = generateCode.delegatedAction;
    expect(action).toBeTypeOf('function');

    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'Feature_v1.csv',
      columns: [
        { name: 'feature_a', dtype: 'number' },
        { name: 'usage_count', dtype: 'number' }
      ]
    });

    const state = createTrainingState([]);
    state.run.currentNode = 'generate_code';
    state.turn.prompt = 'Train a DecisionTreeRegressor.';
    (state.run.metadata as { experiments: Record<string, Record<string, unknown>> }).experiments['exp-1'] = {
      experimentId: 'exp-1',
      experimentName: 'decision tree baseline',
      modelType: 'decision_tree_regressor',
      taskType: 'regression',
      splitStrategy: 'train_test',
      featureColumns: ['feature_a'],
      updatedAt: '2026-04-09T00:00:00.000Z'
    };

    const client = {
      complete: vi.fn()
        .mockResolvedValueOnce([
          '# Cell 1: Imports and Config',
          'from sklearn.ensemble import RandomForestRegressor',
          '# Cell 2: Dataset Prep',
          'print("prep")',
        ].join('\n'))
        .mockResolvedValueOnce([
          '# Cell 1: Imports and Config',
          'from sklearn.tree import DecisionTreeRegressor',
          '# Cell 2: Dataset Prep',
          'print("prep")',
        ].join('\n'))
    };

    const toolCalls = await action!(client as never, state);

    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(client.complete.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Approved modelType "decision_tree_regressor" must implement DecisionTreeRegressor.')
        })
      ])
    }));
    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          content: expect.stringContaining('DecisionTreeRegressor')
        })
      })
    ]);
  });

  it('writes the next segment for the active draft even when a previous model already completed in the same turn', async () => {
    const action = trainingPhaseConfig.getStageConfig('write_code').deterministicAction!;
    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'old-cell' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: '__TRAIN_COMPLETE__|{"rmse":0.44}\nRMSE: 0.44',
          stderr: '',
          cellId: 'old-cell',
          executionMs: 1100
        }
      }),
      makeToolResult('register_model', {
        output: { experimentId: 'exp-1', status: 'registered', modelId: 'model-1' }
      }),
      makeToolResult('write_cell', { output: { cellId: 'new-cell-1' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: 'imports ready',
          stderr: '',
          cellId: 'new-cell-1',
          executionMs: 90
        }
      })
    ]);
    state.toolCallHistory = [
      {
        id: 'write-old',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              segmentIndex: 0,
              segments: [{ title: 'Old', content: 'print("old")' }]
            }
          }
        }
      },
      { id: 'run-old', tool: 'run_cell', args: { cellId: 'old-cell' } },
      { id: 'register-old', tool: 'register_model', args: { experimentId: 'exp-1' } },
      {
        id: 'write-new',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-2',
              experimentId: 'exp-2',
              segmentIndex: 0,
              segments: [
                { title: 'Imports', content: 'import pandas as pd' },
                { title: 'Prep', content: 'df = df.copy()' }
              ]
            }
          }
        }
      },
      { id: 'run-new', tool: 'run_cell', args: { cellId: 'new-cell-1' } }
    ] as never;

    const toolCalls = await action(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          title: 'Prep',
          content: 'df = df.copy()',
          metadata: expect.objectContaining({
            trainingDraft: expect.objectContaining({
              draftId: 'draft-2',
              segmentIndex: 1
            })
          })
        })
      })
    ]);
  });

  it('re-runs the failed draft cell after a missing library has been installed', async () => {
    const action = trainingPhaseConfig.getStageConfig('write_code').deterministicAction!;
    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'cell-1' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'error',
          stderr: "ModuleNotFoundError: No module named 'catboost'",
          cellId: 'cell-1',
        }
      }),
      makeToolResult('install_package', {
        output: {
          success: true,
          message: 'Successfully installed catboost'
        }
      })
    ]);
    state.toolCallHistory = [
      {
        id: 'write-1',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              segmentIndex: 0,
              segments: [
                { title: 'Imports', content: 'from catboost import CatBoostClassifier' },
                { title: 'Train', content: 'print("train")' }
              ]
            }
          }
        }
      },
      { id: 'run-1', tool: 'run_cell', args: { cellId: 'cell-1' } },
      { id: 'install-1', tool: 'install_package', args: { packageName: 'catboost' } }
    ] as never;

    const toolCalls = await action(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'run_cell',
        args: { cellId: 'cell-1' }
      })
    ]);
  });

  it('writes the next segment after the failed cell reruns successfully post-install', async () => {
    const action = trainingPhaseConfig.getStageConfig('write_code').deterministicAction!;
    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'cell-1' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'error',
          stderr: "ModuleNotFoundError: No module named 'catboost'",
          cellId: 'cell-1',
        }
      }),
      makeToolResult('install_package', {
        output: {
          success: true,
          message: 'Successfully installed catboost'
        }
      }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: 'catboost import ok',
          stderr: '',
          cellId: 'cell-1',
        }
      })
    ]);
    state.toolCallHistory = [
      {
        id: 'write-1',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              segmentIndex: 0,
              segments: [
                { title: 'Imports', content: 'from catboost import CatBoostClassifier' },
                { title: 'Train', content: 'print("train")' }
              ]
            }
          }
        }
      },
      { id: 'run-1', tool: 'run_cell', args: { cellId: 'cell-1' } },
      { id: 'install-1', tool: 'install_package', args: { packageName: 'catboost' } },
      { id: 'rerun-1', tool: 'run_cell', args: { cellId: 'cell-1' } }
    ] as never;

    const toolCalls = await action(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          title: 'Train',
          content: 'print("train")',
        })
      })
    ]);
  });

  it('re-prompts notebook repair when the first repair tries to install packages inline', async () => {
    const generateCode = trainingPhaseConfig.getStageConfig('generate_code');
    const action = generateCode.delegatedAction;
    expect(action).toBeTypeOf('function');

    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      projectId: 'project-1',
      filename: 'feature_v2.csv',
      columns: [
        { name: 'feat1', dtype: 'number' },
        { name: 'target', dtype: 'number' }
      ]
    });

    const state = createTrainingState([
      makeToolResult('run_cell', {
        output: {
          status: 'error',
          stderr: "ModuleNotFoundError: No module named 'torch'",
          cellId: 'cell-1'
        }
      }),
      makeToolResult('install_package', {
        output: {
          success: true,
          message: 'Successfully installed torch'
        }
      })
    ]);
    state.run.currentNode = 'generate_code';
    state.toolCallHistory = [
      {
        id: 'write-1',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              segmentIndex: 0,
              segments: [
                { title: 'Imports', content: 'import torch' },
                { title: 'Train', content: 'print("train")' }
              ]
            }
          }
        }
      },
      { id: 'run-1', tool: 'run_cell', args: { cellId: 'cell-1' } },
      { id: 'install-1', tool: 'install_package', args: { packageName: 'torch' } },
    ] as never;

    const client = {
      complete: vi.fn()
        .mockResolvedValueOnce('import subprocess\nsubprocess.check_call([sys.executable, "-m", "pip", "install", "torch"])')
        .mockResolvedValueOnce('import torch\nprint("ready")')
    };

    const toolCalls = await action!(client as never, state);

    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          cellId: 'cell-1',
          content: 'import torch\nprint("ready")',
        })
      })
    ]);
  });

  it('appends a finalization cell instead of looping forever when all draft segments ran without the completion marker', async () => {
    const action = trainingPhaseConfig.getStageConfig('write_code').deterministicAction!;
    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'cell-1' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: 'imports ready',
          stderr: '',
          cellId: 'cell-1',
        }
      }),
      makeToolResult('write_cell', { output: { cellId: 'cell-2' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: 'model fit complete',
          stderr: '',
          cellId: 'cell-2',
        }
      })
    ]);
    state.toolCallHistory = [
      {
        id: 'write-1',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              segmentIndex: 0,
              segments: [
                { title: 'Imports', content: 'import pandas as pd' },
                { title: 'Fit', content: 'model.fit(X_train, y_train)' }
              ]
            }
          }
        }
      },
      { id: 'run-1', tool: 'run_cell', args: { cellId: 'cell-1' } },
      {
        id: 'write-2',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-1',
              experimentId: 'exp-1',
              segmentIndex: 1,
              segments: [
                { title: 'Imports', content: 'import pandas as pd' },
                { title: 'Fit', content: 'model.fit(X_train, y_train)' }
              ]
            }
          }
        }
      },
      { id: 'run-2', tool: 'run_cell', args: { cellId: 'cell-2' } }
    ] as never;

    const toolCalls = await action(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          title: 'Finalize Model Artifact and Metrics',
          content: expect.stringContaining("__TRAIN_COMPLETE__|"),
          metadata: expect.objectContaining({
            trainingDraft: expect.objectContaining({
              draftId: 'draft-1',
              segmentIndex: 2,
              segments: expect.arrayContaining([
                expect.objectContaining({ title: 'Finalize Model Artifact and Metrics' })
              ])
            })
          })
        })
      })
    ]);

    const footerContent = toolCalls[0].args.content as string;
    expect(footerContent).toContain('def _is_predictable(value):');
    expect(footerContent).toContain('hasattr(value, "predict")');
    expect(footerContent).toContain("isinstance(candidate_value, dict)");
    expect(footerContent).toContain('No sklearn-compatible trained model or pipeline was found');
  });

  it('emits the completion footer even when a prior segment printed __TRAIN_COMPLETE__ without calling joblib.dump', async () => {
    const writeCodeStage = trainingPhaseConfig.getStageConfig('write_code');
    const action = writeCodeStage.deterministicAction!;
    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'cell-1' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: '__TRAIN_COMPLETE__|{"rmse":2.97}\nMarker printed but artifact not saved.',
          cellId: 'cell-1',
        }
      })
    ]);
    state.run.currentNode = 'write_code';
    // One-segment draft whose content has the marker but NO joblib.dump.
    state.toolCallHistory = [
      {
        id: 'write-only-marker',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-mk',
              experimentId: 'exp-mk',
              segmentIndex: 0,
              segments: [
                {
                  title: 'Model Fit and Evaluation',
                  content: 'model.fit(X_train, y_train)\nprint("__TRAIN_COMPLETE__|" + json.dumps(final_metrics))'
                }
              ]
            }
          }
        }
      },
      { id: 'run-only-marker', tool: 'run_cell', args: { cellId: 'cell-1' } }
    ] as never;

    const toolCalls = await action(state);

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].tool).toBe('write_cell');
    expect((toolCalls[0].args as { title?: string }).title).toBe('Finalize Model Artifact and Metrics');
    expect((toolCalls[0].args as { content: string }).content).toContain("joblib.dump(trained_artifact, 'model.joblib')");
  });

  it('injects the completion footer when register_model failed with ENOENT and no written cell saved the artifact', async () => {
    // Gap #2 regression: the LLM wrote 3 cells (imports, data prep, model fit)
    // but skipped the planned "Artifact Save" segment and jumped straight to
    // execute_training → evaluate_results → register_model. register_model
    // fails with ENOENT because model.joblib was never written. Stage router
    // bounces back to write_code; this action must force-inject the footer so
    // the retry succeeds instead of spinning into TRAINING_NO_PROGRESS.
    const writeCodeStage = trainingPhaseConfig.getStageConfig('write_code');
    const action = writeCodeStage.deterministicAction!;
    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'cell-imports' } }),
      makeToolResult('run_cell', { output: { status: 'success', stdout: '', cellId: 'cell-imports' } }),
      makeToolResult('write_cell', { output: { cellId: 'cell-prep' } }),
      makeToolResult('run_cell', { output: { status: 'success', stdout: '', cellId: 'cell-prep' } }),
      makeToolResult('write_cell', { output: { cellId: 'cell-fit' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: '__TRAIN_COMPLETE__|{"rmse":1.2}',
          cellId: 'cell-fit',
        }
      }),
      makeToolResult('execute_training', { output: { status: 'training' } }),
      makeToolResult('evaluate_results', { output: { status: 'evaluated' } }),
      makeRegisterModelArtifactFailure(),
    ]);
    state.run.currentNode = 'write_code';
    // 4-segment plan — LLM wrote segments 0,1,2 but skipped segment 3 (the
    // "Artifact Save" segment). The unwritten plan should NOT be treated as
    // proof the artifact was saved.
    state.toolCallHistory = [
      {
        id: 'write-imports',
        tool: 'write_cell',
        args: {
          content: 'import joblib',
          metadata: {
            trainingDraft: {
              draftId: 'draft-enoent',
              experimentId: 'exp-enoent',
              segmentIndex: 0,
              segments: [
                { title: 'Imports', content: 'import joblib' },
                { title: 'Dataset Prep', content: 'df = pd.read_csv(...)' },
                { title: 'Model Fit', content: 'model.fit(X,y)\nprint("__TRAIN_COMPLETE__|" + json.dumps(m))' },
                { title: 'Artifact Save', content: 'joblib.dump(model, "model.joblib")' },
              ]
            }
          }
        }
      },
      { id: 'run-imports', tool: 'run_cell', args: { cellId: 'cell-imports' } },
      { id: 'write-prep', tool: 'write_cell', args: { content: 'df = pd.read_csv(...)' } },
      { id: 'run-prep', tool: 'run_cell', args: { cellId: 'cell-prep' } },
      {
        id: 'write-fit',
        tool: 'write_cell',
        args: {
          content: 'model.fit(X_train, y_train)\nprint("__TRAIN_COMPLETE__|" + json.dumps(final_metrics))',
        }
      },
      { id: 'run-fit', tool: 'run_cell', args: { cellId: 'cell-fit' } },
    ] as never;

    const toolCalls = await action(state);

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].tool).toBe('write_cell');
    expect((toolCalls[0].args as { title?: string }).title).toBe('Finalize Model Artifact and Metrics');
    expect((toolCalls[0].args as { content: string }).content).toContain("joblib.dump(trained_artifact, 'model.joblib')");
    expect(toolCalls[0].rationale).toMatch(/ENOENT|retry/i);
  });

  it('skips the completion footer when a written cell already calls joblib.dump AND emits the marker', async () => {
    const writeCodeStage = trainingPhaseConfig.getStageConfig('write_code');
    const action = writeCodeStage.deterministicAction!;
    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'cell-1' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: '__TRAIN_COMPLETE__|{"rmse":0.42}',
          cellId: 'cell-1',
        }
      })
    ]);
    state.run.currentNode = 'write_code';
    state.toolCallHistory = [
      {
        id: 'write-complete',
        tool: 'write_cell',
        args: {
          // Real write_cell tool calls always carry `args.content` — the
          // authoritative source for what the cell contains after any
          // mid-turn re-writes. The Gap #2 fix reads from args.content
          // instead of the frozen trainingDraft.segments plan so that
          // unwritten planned segments don't falsely imply an artifact
          // save.
          content: 'model.fit(X_train, y_train)\njoblib.dump(model, "model.joblib")\nprint("__TRAIN_COMPLETE__|" + json.dumps(final_metrics))',
          metadata: {
            trainingDraft: {
              draftId: 'draft-ok',
              experimentId: 'exp-ok',
              segmentIndex: 0,
              segments: [
                {
                  title: 'Model Fit and Save',
                  content: 'model.fit(X_train, y_train)\njoblib.dump(model, "model.joblib")\nprint("__TRAIN_COMPLETE__|" + json.dumps(final_metrics))'
                }
              ]
            }
          }
        }
      },
      { id: 'run-ok', tool: 'run_cell', args: { cellId: 'cell-1' } }
    ] as never;

    const toolCalls = await action(state);
    expect(toolCalls).toEqual([]);
  });

  it('recovers the active training draft from prior-turn history when resuming write_code', async () => {
    const writeCodeStage = trainingPhaseConfig.getStageConfig('write_code');
    const action = writeCodeStage.deterministicAction!;
    const state = createTrainingState([
      makeToolResult('write_cell', { output: { cellId: 'cell-1' } }),
      makeToolResult('run_cell', {
        output: {
          status: 'success',
          stdout: 'imports ready',
          cellId: 'cell-1',
        }
      }),
    ]);
    state.run.currentNode = 'write_code';
    state.toolCallHistory = [
      {
        id: 'write-1',
        tool: 'write_cell',
        args: {
          metadata: {
            trainingDraft: {
              draftId: 'draft-resume',
              experimentId: 'exp-1',
              segmentIndex: 0,
              segments: [
                { title: 'Imports', content: 'import pandas as pd' },
                { title: 'Fit', content: 'model.fit(X_train, y_train)' }
              ]
            }
          }
        }
      },
      { id: 'run-1', tool: 'run_cell', args: { cellId: 'cell-1' } }
    ] as never;
    state.turnStartToolCallCount = state.toolCallHistory.length;

    const toolCalls = await action(state);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          title: 'Fit',
          metadata: expect.objectContaining({
            trainingDraft: expect.objectContaining({
              draftId: 'draft-resume',
              segmentIndex: 1,
            })
          })
        })
      })
    ]);
  });
});
