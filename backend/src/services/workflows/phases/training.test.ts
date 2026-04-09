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
    it('advances configure_experiment → propose_model', () => {
      expect(resolve('configure_experiment', [])).toBe('propose_model');
    });

    it('advances propose_model → generate_code', () => {
      expect(resolve('propose_model', [])).toBe('generate_code');
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
});
