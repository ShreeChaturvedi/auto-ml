import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted state                                                      */
/* ------------------------------------------------------------------ */

const hoisted = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockGetOrCreateContainer = vi.fn();
  const mockSyncWorkspaceDatasets = vi.fn();
  const mockModelGetById = vi.fn();
  const mockModelCreate = vi.fn();
  const mockDatasetGetById = vi.fn();
  const mockGetModelTemplate = vi.fn();
  const mockDbQuery = vi.fn();
  const mockHasDatabaseConfiguration = vi.fn();

  return {
    mockExecute,
    mockGetOrCreateContainer,
    mockSyncWorkspaceDatasets,
    mockModelGetById,
    mockModelCreate,
    mockDatasetGetById,
    mockGetModelTemplate,
    mockDbQuery,
    mockHasDatabaseConfiguration,
  };
});

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('../../utils/containerOrchestrator.js', () => ({
  orchestrateContainerExecution: hoisted.mockExecute,
  copyArtifactsToPermanentStorage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../containerManager.js', () => ({
  getOrCreateContainer: hoisted.mockGetOrCreateContainer,
}));

vi.mock('../executionWorkspace.js', () => ({
  syncWorkspaceDatasets: hoisted.mockSyncWorkspaceDatasets,
}));

vi.mock('../../repositories/modelRepository.js', () => ({
  createModelRepository: () => ({
    getById: hoisted.mockModelGetById,
    create: hoisted.mockModelCreate,
  }),
}));

vi.mock('../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    getById: hoisted.mockDatasetGetById,
  }),
}));

vi.mock('../modelTemplates.js', () => ({
  getModelTemplate: hoisted.mockGetModelTemplate,
}));

vi.mock('../../db.js', () => ({
  getDbPool: () => ({ query: hoisted.mockDbQuery }),
  hasDatabaseConfiguration: () => hoisted.mockHasDatabaseConfiguration(),
}));

vi.mock('../../config.js', () => ({
  env: {
    datasetMetadataPath: '/tmp/test-datasets.json',
    modelMetadataPath: '/tmp/test-models.json',
    modelStorageDir: '/tmp/test-model-storage',
    executionWorkspaceDir: '/tmp/test-workspaces',
    datasetStorageDir: '/tmp/test-datasets',
    executionTimeoutMs: 30000,
  },
}));

vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{}'),
  rm: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 2048 }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

/* ------------------------------------------------------------------ */
/*  Import SUT (after mocks)                                           */
/* ------------------------------------------------------------------ */

import type { ModelTemplate } from '../../types/model.js';
import { buildTuningScript, deleteTuningStudiesByModelId, runTuningStudy } from '../tuningService.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const {
  mockExecute,
  mockGetOrCreateContainer,
  mockSyncWorkspaceDatasets,
  mockModelGetById,
  mockModelCreate,
  mockDatasetGetById,
  mockGetModelTemplate,
  mockDbQuery,
  mockHasDatabaseConfiguration,
} = hoisted;

function makeClassificationTemplate(): ModelTemplate {
  return {
    id: 'random_forest_classifier',
    name: 'Random Forest',
    taskType: 'classification',
    description: 'Ensemble of decision trees.',
    library: 'sklearn',
    importPath: 'sklearn.ensemble',
    modelClass: 'RandomForestClassifier',
    metrics: ['accuracy', 'precision', 'recall', 'f1'],
    parameters: [
      {
        key: 'n_estimators',
        label: 'Trees',
        type: 'number',
        default: 200,
        min: 10,
        max: 1000,
        step: 10,
      },
      {
        key: 'max_depth',
        label: 'Max depth',
        type: 'number',
        default: 10,
        min: 2,
        max: 50,
      },
      {
        key: 'min_samples_split',
        label: 'Min samples split',
        type: 'number',
        default: 2,
        min: 2,
        max: 20,
      },
    ],
    defaultParams: {
      n_estimators: 200,
      max_depth: 10,
      min_samples_split: 2,
      random_state: 42,
    },
  };
}

function makeLogisticTemplate(): ModelTemplate {
  return {
    id: 'logistic_regression',
    name: 'Logistic Regression',
    taskType: 'classification',
    description: 'Interpretable baseline classifier.',
    library: 'sklearn',
    importPath: 'sklearn.linear_model',
    modelClass: 'LogisticRegression',
    metrics: ['accuracy', 'precision', 'recall', 'f1'],
    parameters: [
      {
        key: 'C',
        label: 'Regularization',
        type: 'number',
        default: 1.0,
        min: 0.01,
        max: 10,
        step: 0.1,
      },
      {
        key: 'max_iter',
        label: 'Max iterations',
        type: 'number',
        default: 200,
        min: 100,
        max: 1000,
        step: 50,
      },
    ],
    defaultParams: { C: 1.0, max_iter: 200 },
  };
}

function makeSelectTemplate(): ModelTemplate {
  return {
    id: 'svm_classifier',
    name: 'SVM',
    taskType: 'classification',
    description: 'SVM classifier.',
    library: 'sklearn',
    importPath: 'sklearn.svm',
    modelClass: 'SVC',
    metrics: ['accuracy'],
    parameters: [
      {
        key: 'kernel',
        label: 'Kernel',
        type: 'select',
        default: 'rbf',
        options: [
          { value: 'rbf', label: 'RBF' },
          { value: 'linear', label: 'Linear' },
          { value: 'poly', label: 'Polynomial' },
        ],
      },
      {
        key: 'C',
        label: 'Regularization',
        type: 'number',
        default: 1.0,
        min: 0.001,
        max: 1000,
        step: 0.1,
      },
    ],
    defaultParams: { kernel: 'rbf', C: 1.0 },
  };
}

function makeContainer() {
  return {
    id: 'container-1',
    containerId: 'docker-123',
    projectId: 'test-project',
    pythonVersion: '3.11',
    workspacePath: '/tmp/test-workspaces/test-project/model-runtime',
    kernelGatewayPort: 8888,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  };
}

function makeModelRecord(overrides: Record<string, unknown> = {}) {
  return {
    modelId: 'test-model-id',
    projectId: 'test-project',
    datasetId: 'test-dataset',
    name: 'Random Forest · 2026-01-01',
    templateId: 'random_forest_classifier',
    taskType: 'classification',
    library: 'sklearn',
    algorithm: 'RandomForestClassifier',
    parameters: { n_estimators: 200 },
    metrics: { accuracy: 0.85 },
    status: 'completed',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    targetColumn: 'target',
    featureColumns: ['feat1', 'feat2'],
    sampleCount: 1000,
    artifact: {
      filename: 'model.joblib',
      path: '/tmp/test-model-storage/test-model-id/model.joblib',
      size: 1024,
    },
    ...overrides,
  };
}

function makeMockRes() {
  const chunks: string[] = [];
  return {
    writableEnded: false,
    write: vi.fn((data: string) => { chunks.push(data); }),
    end: vi.fn(function (this: { writableEnded: boolean }) { this.writableEnded = true; }),
    chunks,
  };
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                   */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockSyncWorkspaceDatasets.mockResolvedValue({ links: [], collisions: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ================================================================== */
/*  buildTuningScript tests                                            */
/* ================================================================== */

describe('buildTuningScript', () => {
  it('maps type=number integer param to trial.suggest_int()', () => {
    const template = makeClassificationTemplate();
    const script = buildTuningScript({
      template,
      datasetPath: '/workspace/datasets/data.csv',
      targetColumn: 'target',
      testSize: 0.2,
      nTrials: 20,
      metric: 'accuracy',
      timeoutSeconds: 300,
      outputDir: '/workspace/tuning/m1',
    });

    // n_estimators has integer default=200, min=10, max=1000, step=10 => suggest_int
    expect(script).toContain('trial.suggest_int("n_estimators", 10, 1000)');
    // max_depth has integer default=10, min=2, max=50 => suggest_int
    expect(script).toContain('trial.suggest_int("max_depth", 2, 50)');
    // min_samples_split has integer default=2, min=2, max=20 => suggest_int
    expect(script).toContain('trial.suggest_int("min_samples_split", 2, 20)');
  });

  it('maps type=number float param to trial.suggest_float()', () => {
    const template = makeLogisticTemplate();
    const script = buildTuningScript({
      template,
      datasetPath: '/workspace/datasets/data.csv',
      targetColumn: 'target',
      testSize: 0.2,
      nTrials: 10,
      metric: 'accuracy',
      timeoutSeconds: 300,
      outputDir: '/workspace/tuning/m2',
    });

    // C has float default=1.0, min=0.01, max=10, step=0.1 => suggest_float
    // max/min = 10/0.01 = 1000 > 100 => log=True
    expect(script).toContain('trial.suggest_float("C"');
    // max_iter has integer default=200, min=100, max=1000, step=50 => suggest_int
    expect(script).toContain('trial.suggest_int("max_iter", 100, 1000)');
  });

  it('maps type=select param to trial.suggest_categorical()', () => {
    const template = makeSelectTemplate();
    const script = buildTuningScript({
      template,
      datasetPath: '/workspace/datasets/data.csv',
      targetColumn: 'target',
      testSize: 0.2,
      nTrials: 10,
      metric: 'accuracy',
      timeoutSeconds: 300,
      outputDir: '/workspace/tuning/m3',
    });

    expect(script).toContain('trial.suggest_categorical("kernel", ["rbf", "linear", "poly"])');
  });

  it('uses log=True when param max/min ratio > 100', () => {
    const template = makeSelectTemplate();
    const script = buildTuningScript({
      template,
      datasetPath: '/workspace/datasets/data.csv',
      targetColumn: 'target',
      testSize: 0.2,
      nTrials: 10,
      metric: 'accuracy',
      timeoutSeconds: 300,
      outputDir: '/workspace/tuning/m4',
    });

    // C: min=0.001, max=1000 => ratio = 1_000_000 > 100 => log=True
    expect(script).toContain('trial.suggest_float("C", 0.001, 1000, log=True)');
  });

  it('generates valid Python with correct dataset loading, CV, and streaming', () => {
    const template = makeClassificationTemplate();
    const script = buildTuningScript({
      template,
      datasetPath: '/workspace/datasets/data.csv',
      targetColumn: 'target',
      testSize: 0.2,
      nTrials: 50,
      metric: 'accuracy',
      timeoutSeconds: 600,
      outputDir: '/workspace/tuning/m5',
    });

    // Imports
    expect(script).toContain('import optuna');
    expect(script).toContain('import json');
    expect(script).toContain('import joblib');
    expect(script).toContain('import pandas as pd');
    expect(script).toContain('from sklearn.model_selection import train_test_split, cross_val_score');
    expect(script).toContain('from sklearn.ensemble import RandomForestClassifier');

    // Dataset loading & preprocessing
    expect(script).toContain('pd.read_csv');
    expect(script).toContain('dropna(subset=[target_col])');
    expect(script).toContain('get_dummies');
    expect(script).toContain('fillna(0)');

    // Train/test split
    expect(script).toContain('train_test_split');
    expect(script).toContain('random_state=42');
    expect(script).toContain('stratify');

    // Objective with cross-validation
    expect(script).toContain('def objective(trial):');
    expect(script).toContain('cross_val_score');
    expect(script).toContain('cv=5');
    expect(script).toContain('scoring="accuracy"');

    // Streaming callback
    expect(script).toContain('def stream_callback(study, trial):');
    expect(script).toContain("'type': 'trial_result'");
    expect(script).toContain("'trial_number': trial.number");
    expect(script).toContain("'best_value': study.best_value");
    expect(script).toContain('flush=True');

    // Study creation and optimization
    expect(script).toContain('optuna.create_study(direction="maximize", sampler=sampler)');
    expect(script).toContain('study.optimize(objective, n_trials=50, timeout=600');
    expect(script).toContain('callbacks=[stream_callback]');

    // Refit best model
    expect(script).toContain('best_params = study.best_params');
    expect(script).toContain('best_model.fit(X_train, y_train)');

    // Save artifacts
    expect(script).toContain('joblib.dump(best_model');
    expect(script).toContain('tuning_summary.json');

    // Final done marker
    expect(script).toContain('{"type": "done"}');
  });

  it('omits random_state when template defaultParams lacks it', () => {
    const template: ModelTemplate = {
      id: 'ridge_regression',
      name: 'Ridge',
      taskType: 'regression',
      description: 'Ridge regression.',
      library: 'sklearn',
      importPath: 'sklearn.linear_model',
      modelClass: 'Ridge',
      metrics: ['r2'],
      parameters: [
        { key: 'alpha', label: 'Alpha', type: 'number', default: 1.0, min: 0.001, max: 100 }
      ],
      defaultParams: { alpha: 1.0 },
    };
    const script = buildTuningScript({
      template,
      datasetPath: '/workspace/datasets/data.csv',
      targetColumn: 'target',
      testSize: 0.2,
      nTrials: 10,
      metric: 'r2',
      timeoutSeconds: 300,
      outputDir: '/workspace/tuning/ridge1',
    });
    // Model creation lines should NOT contain random_state
    expect(script).toContain('Ridge(**params)');
    expect(script).not.toContain('Ridge(**params, random_state=42)');
    expect(script).not.toContain('Ridge(**best_params, random_state=42)');
  });

  it('uses minimize direction for lower-is-better metrics (rmse, mae)', () => {
    const template: ModelTemplate = {
      id: 'ridge_regression',
      name: 'Ridge',
      taskType: 'regression',
      description: 'Ridge regression.',
      library: 'sklearn',
      importPath: 'sklearn.linear_model',
      modelClass: 'Ridge',
      metrics: ['r2'],
      parameters: [
        { key: 'alpha', label: 'Alpha', type: 'number', default: 1.0, min: 0.001, max: 100 }
      ],
      defaultParams: { alpha: 1.0 },
    };

    for (const metric of ['rmse', 'mae', 'mse', 'log_loss']) {
      const script = buildTuningScript({
        template,
        datasetPath: '/workspace/datasets/data.csv',
        targetColumn: 'target',
        testSize: 0.2,
        nTrials: 10,
        metric,
        timeoutSeconds: 300,
        outputDir: `/workspace/tuning/min-${metric}`,
      });
      expect(script).toContain('optuna.create_study(direction="minimize"');
      expect(script).toContain('DIRECTION = "minimize"');
      // Optimization history should use < for running best
      expect(script).toContain('t.value < running_best:');
    }
  });

  it('uses maximize direction for higher-is-better metrics (accuracy, r2, f1)', () => {
    const template = makeClassificationTemplate();

    for (const metric of ['accuracy', 'f1', 'r2', 'precision', 'recall']) {
      const script = buildTuningScript({
        template,
        datasetPath: '/workspace/datasets/data.csv',
        targetColumn: 'target',
        testSize: 0.2,
        nTrials: 10,
        metric,
        timeoutSeconds: 300,
        outputDir: `/workspace/tuning/max-${metric}`,
      });
      expect(script).toContain('optuna.create_study(direction="maximize"');
      expect(script).toContain('DIRECTION = "maximize"');
      expect(script).toContain('t.value > running_best:');
    }
  });

  it('includes convergence tracking in stream callback', () => {
    const template = makeClassificationTemplate();
    const script = buildTuningScript({
      template,
      datasetPath: '/workspace/datasets/data.csv',
      targetColumn: 'target',
      testSize: 0.2,
      nTrials: 50,
      metric: 'accuracy',
      timeoutSeconds: 600,
      outputDir: '/workspace/tuning/conv1',
    });
    expect(script).toContain("'type': 'convergence_update'");
    expect(script).toContain("'type': 'importance_update'");
  });
});

/* ================================================================== */
/*  runTuningStudy tests                                               */
/* ================================================================== */

describe('runTuningStudy', () => {
  it('streams trial events and writes done on success', async () => {
    const model = makeModelRecord();
    const template = makeClassificationTemplate();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project' };
    const res = makeMockRes();

    mockModelGetById.mockResolvedValue(model);
    mockGetModelTemplate.mockReturnValue(template);
    mockDatasetGetById.mockResolvedValue(dataset);
    mockGetOrCreateContainer.mockResolvedValue(container);

    // Mock readFile to return a valid summary
    const { readFile: mockReadFile } = await import('node:fs/promises');
    vi.mocked(mockReadFile).mockResolvedValue(JSON.stringify({
      best_params: { n_estimators: 300, max_depth: 15 },
      best_value: 0.92,
      best_trial_number: 7,
      optimization_history: { trial_numbers: [0, 1], values: [0.85, 0.92], best_values: [0.85, 0.92] },
      param_importances: { params: ['n_estimators'], importances: [0.8] },
    }));

    mockModelCreate.mockResolvedValue({
      ...model,
      modelId: 'new-tuned-model-id',
      parameters: { n_estimators: 300, max_depth: 15 },
    });

    // Simulate orchestrateContainerExecution with streaming output
    mockExecute.mockImplementation(async (config: unknown) => {
      const cfg = config as { onOutput?: (output: { type: string; content: string }) => void };
      // Simulate streaming trial output
      cfg.onOutput?.({
        type: 'text',
        content: '{"type": "trial_result", "trial_number": 0, "state": "COMPLETE", "value": 0.85, "params": {"n_estimators": 200}, "best_value": 0.85, "best_params": {"n_estimators": 200}, "n_complete": 1, "n_total": 2}\n',
      });
      cfg.onOutput?.({
        type: 'text',
        content: '{"type": "trial_result", "trial_number": 1, "state": "COMPLETE", "value": 0.92, "params": {"n_estimators": 300}, "best_value": 0.92, "best_params": {"n_estimators": 300}, "n_complete": 2, "n_total": 2}\n',
      });
      cfg.onOutput?.({
        type: 'text',
        content: '{"type": "done"}\n',
      });

      return {
        container,
        executionResult: {
          status: 'success',
          stderr: '',
          executionMs: 10000,
        },
      };
    });

    await runTuningStudy('test-project', 'test-model-id', 2, 'accuracy', 600, res as never);

    // Should have written 2 trial events + 1 done event
    expect(res.write).toHaveBeenCalled();
    const writtenLines = res.chunks.map((c) => JSON.parse(c.trim()));

    // Trial events were streamed
    const trialEvents = writtenLines.filter((e) => e.type === 'trial_result');
    expect(trialEvents).toHaveLength(2);
    expect(trialEvents[0].trial_number).toBe(0);
    expect(trialEvents[1].trial_number).toBe(1);

    // Done event with resultModelId
    const doneEvent = writtenLines.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.resultModelId).toBe('new-tuned-model-id');

    // Response ended
    expect(res.end).toHaveBeenCalled();
  });

  it('writes error when model not found', async () => {
    const res = makeMockRes();
    mockModelGetById.mockResolvedValue(undefined);

    await runTuningStudy('test-project', 'nonexistent', 10, 'accuracy', 600, res as never);

    const writtenLines = res.chunks.map((c) => JSON.parse(c.trim()));
    expect(writtenLines).toHaveLength(1);
    expect(writtenLines[0].type).toBe('error');
    expect(writtenLines[0].message).toContain('not found');
    expect(res.end).toHaveBeenCalled();
  });

  it('writes error when execution fails', async () => {
    const model = makeModelRecord();
    const template = makeClassificationTemplate();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project' };
    const res = makeMockRes();

    mockModelGetById.mockResolvedValue(model);
    mockGetModelTemplate.mockReturnValue(template);
    mockDatasetGetById.mockResolvedValue(dataset);
    mockGetOrCreateContainer.mockResolvedValue(container);

    mockExecute.mockResolvedValue({
      container,
      executionResult: {
        status: 'error',
        stderr: 'ImportError: No module named optuna',
        error: 'Execution failed',
        executionMs: 500,
      },
    });

    // existsSync returns false for summary path
    const { existsSync: mockExistsSync } = await import('node:fs');
    vi.mocked(mockExistsSync).mockReturnValue(false);

    await runTuningStudy('test-project', 'test-model-id', 10, 'accuracy', 600, res as never);

    const writtenLines = res.chunks.map((c) => JSON.parse(c.trim()));
    const errorEvent = writtenLines.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain('optuna');
    expect(res.end).toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  deleteTuningStudiesByModelId tests                                 */
/* ================================================================== */

describe('deleteTuningStudiesByModelId', () => {
  it('deletes tuning studies referencing the model when DB is configured', async () => {
    mockHasDatabaseConfiguration.mockReturnValue(true);
    mockDbQuery.mockResolvedValue({ rowCount: 2 });

    const count = await deleteTuningStudiesByModelId('model-to-delete');

    expect(count).toBe(2);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'DELETE FROM tuning_studies WHERE source_model_id = $1 OR result_model_id = $1',
      ['model-to-delete'],
    );
  });

  it('returns 0 and skips query when DB is not configured', async () => {
    mockHasDatabaseConfiguration.mockReturnValue(false);

    const count = await deleteTuningStudiesByModelId('model-to-delete');

    expect(count).toBe(0);
    expect(mockDbQuery).not.toHaveBeenCalled();
  });
});
