import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted state                                                      */
/* ------------------------------------------------------------------ */

const hoisted = vi.hoisted(() => {
  const mockOrchestrateContainerExecution = vi.fn();
  const mockCopyArtifactsToPermanentStorage = vi.fn();
  const mockGetById = vi.fn();
  const mockUpdate = vi.fn();
  const mockDatasetGetById = vi.fn();

  return {
    mockOrchestrateContainerExecution,
    mockCopyArtifactsToPermanentStorage,
    mockGetById,
    mockUpdate,
    mockDatasetGetById,
  };
});

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('../../utils/containerOrchestrator.js', () => ({
  orchestrateContainerExecution: hoisted.mockOrchestrateContainerExecution,
  copyArtifactsToPermanentStorage: hoisted.mockCopyArtifactsToPermanentStorage,
}));

vi.mock('../../repositories/modelRepository.js', () => ({
  createModelRepository: () => ({
    getById: hoisted.mockGetById,
    update: hoisted.mockUpdate,
  }),
}));

vi.mock('../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    getById: hoisted.mockDatasetGetById,
  }),
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

// Mock fs/promises to avoid actual file operations
vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{}'),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

import { buildEvaluationScript, runEvaluation } from '../evaluationService.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const {
  mockOrchestrateContainerExecution,
  mockCopyArtifactsToPermanentStorage,
  mockGetById,
  mockUpdate,
  mockDatasetGetById,
} = hoisted;

function makeModelRecord(overrides: Record<string, unknown> = {}) {
  return {
    modelId: 'test-model-id',
    projectId: 'test-project',
    datasetId: 'test-dataset',
    name: 'Test Model',
    templateId: 'random-forest',
    taskType: 'classification',
    library: 'sklearn',
    algorithm: 'RandomForestClassifier',
    parameters: { n_estimators: 100 },
    metrics: { accuracy: 0.95 },
    status: 'completed',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    targetColumn: 'target',
    artifact: {
      filename: 'model.joblib',
      path: '/tmp/test-model-storage/test-model-id/model.joblib',
      size: 1024,
    },
    evaluationStatus: 'pending',
    ...overrides,
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

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                   */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe('buildEvaluationScript', () => {
  it('returns valid Python for classification task type', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m1/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m1',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.2,
    });

    // Must contain classification-specific code
    expect(script).toContain('confusion_matrix');
    expect(script).toContain('classification_report');
    expect(script).toContain('roc_curve');
    expect(script).toContain('precision_recall_curve');
    expect(script).toContain('calibration_curve');
    expect(script).toContain('class_distribution');
    expect(script).toContain('predict_proba');

    // Must contain general evaluation code
    expect(script).toContain('joblib.load');
    expect(script).toContain('pd.read_csv');
    expect(script).toContain('permutation_importance');
    expect(script).toContain('learning_curve');
    expect(script).toContain('cross_val_score');
    expect(script).toContain('predictions.parquet');
    expect(script).toContain('evaluation.json');

    // Must NOT contain regression-specific code
    expect(script).not.toContain('residual_histogram');
    expect(script).not.toContain('residuals_arr');
  });

  it('returns valid Python for regression task type', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m2/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m2',
      taskType: 'regression',
      targetColumn: 'price',
      testSize: 0.2,
    });

    // Must contain regression-specific code
    expect(script).toContain('residuals');
    expect(script).toContain('residual_histogram');
    expect(script).toContain('np.histogram');

    // Must NOT contain classification-specific code
    expect(script).not.toContain('confusion_matrix');
    expect(script).not.toContain('roc_curve');
    expect(script).not.toContain('calibration_curve');

    // Must contain general evaluation code
    expect(script).toContain('permutation_importance');
    expect(script).toContain('learning_curve');
    expect(script).toContain('cross_val_score');
  });

  it('includes SHAP computation in try/except', () => {
    const script = buildEvaluationScript({
      modelPath: '/workspace/models/m3/model.joblib',
      datasetPath: '/workspace/datasets/data.csv',
      outputDir: '/workspace/eval/m3',
      taskType: 'classification',
      targetColumn: 'target',
      testSize: 0.2,
    });

    expect(script).toContain('shap');
    expect(script).toContain('try:');
    expect(script).toContain('except');
    expect(script).toContain('TreeExplainer');
    expect(script).toContain('LinearExplainer');
    expect(script).toContain('shap.json');
    // Memory safety: subsample to 1000
    expect(script).toContain('1000');
  });
});

describe('runEvaluation', () => {
  it('sets evaluationStatus to computing then ready on success', async () => {
    const model = makeModelRecord();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'success',
        stderr: '',
        executionMs: 5000,
      },
    });

    await runEvaluation('test-model-id');

    // Verify status transitions
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    // First call: set to 'computing'
    const firstUpdateCall = mockUpdate.mock.calls[0];
    expect(firstUpdateCall[0]).toBe('test-model-id');
    const firstResult = firstUpdateCall[1](model);
    expect(firstResult.evaluationStatus).toBe('computing');

    // Second call: set to 'ready'
    const secondUpdateCall = mockUpdate.mock.calls[1];
    expect(secondUpdateCall[0]).toBe('test-model-id');
    const secondResult = secondUpdateCall[1](model);
    expect(secondResult.evaluationStatus).toBe('ready');
    expect(secondResult.evaluationComputedAt).toBeDefined();
  });

  it('sets evaluationStatus to failed on Docker error', async () => {
    const model = makeModelRecord();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'error',
        stderr: 'RuntimeError: CUDA out of memory',
        error: 'Execution failed',
        executionMs: 1000,
      },
    });

    await runEvaluation('test-model-id');

    // Verify status transitions
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    // First call: set to 'computing'
    const firstResult = mockUpdate.mock.calls[0][1](model);
    expect(firstResult.evaluationStatus).toBe('computing');

    // Second call: set to 'failed'
    const secondResult = mockUpdate.mock.calls[1][1](model);
    expect(secondResult.evaluationStatus).toBe('failed');
    expect(secondResult.evaluationError).toContain('CUDA out of memory');
  });

  it('copies artifacts to modelStorageDir on success', async () => {
    const model = makeModelRecord();
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'success',
        stderr: '',
        executionMs: 5000,
      },
    });
    mockCopyArtifactsToPermanentStorage.mockResolvedValue(undefined);

    await runEvaluation('test-model-id');

    // Verify copyArtifactsToPermanentStorage was called
    expect(mockCopyArtifactsToPermanentStorage).toHaveBeenCalledTimes(1);

    // Get the call arguments
    const callArgs = mockCopyArtifactsToPermanentStorage.mock.calls[0];
    const [modelId, copyContainer, artifacts] = callArgs;

    // Verify arguments
    expect(modelId).toBe('test-model-id');
    expect(copyContainer).toBe(container);

    // Should have artifact entries for evaluation.json, predictions.parquet, and shap.json
    const artifactWorkspaces = artifacts.map((a: Record<string, unknown>) => a.workspace);
    expect(artifactWorkspaces).toContain('eval/test-model-id/evaluation.json');
    expect(artifactWorkspaces).toContain('eval/test-model-id/predictions.parquet');
    expect(artifactWorkspaces).toContain('eval/test-model-id/shap.json');
  });

  it('reuses the stored model test size when building the evaluation script', async () => {
    const model = makeModelRecord({ metadata: { testSize: 0.3 } });
    const container = makeContainer();
    const dataset = { datasetId: 'test-dataset', filename: 'data.csv', projectId: 'test-project', columns: [{ name: 'feat1' }, { name: 'target' }] };

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(dataset);
    mockOrchestrateContainerExecution.mockImplementation(async (config: unknown) => {
      const cfg = config as { scriptBuilder: () => string };
      const script = cfg.scriptBuilder();
      expect(script).toContain('test_size = 0.3');
      return {
        container,
        executionResult: { status: 'success', stderr: '', executionMs: 5000 },
      };
    });

    await runEvaluation('test-model-id');
  });

  it('does not throw when model is not found', async () => {
    mockGetById.mockResolvedValue(undefined);

    // Should not throw (fire-and-forget safety)
    await expect(runEvaluation('nonexistent')).resolves.toBeUndefined();
  });

  it('sets failed status when dataset is not found', async () => {
    const model = makeModelRecord();

    mockGetById.mockResolvedValue(model);
    mockUpdate.mockImplementation(async (_id: string, updater: (r: unknown) => unknown) => updater(model));
    mockDatasetGetById.mockResolvedValue(undefined);

    await runEvaluation('test-model-id');

    // Should have been called twice: computing + failed
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    const failedResult = mockUpdate.mock.calls[1][1](model);
    expect(failedResult.evaluationStatus).toBe('failed');
    expect(failedResult.evaluationError).toContain('Dataset not found');
  });
});
