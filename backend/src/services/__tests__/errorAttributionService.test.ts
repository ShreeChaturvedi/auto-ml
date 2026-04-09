import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted state                                                      */
/* ------------------------------------------------------------------ */

const hoisted = vi.hoisted(() => {
  const mockOrchestrateContainerExecution = vi.fn();
  const mockCopyArtifactsToPermanentStorage = vi.fn();
  const mockGetById = vi.fn();
  const mockDatasetGetById = vi.fn();
  const mockResolveAndHealTargetColumn = vi.fn();

  return {
    mockOrchestrateContainerExecution,
    mockCopyArtifactsToPermanentStorage,
    mockGetById,
    mockDatasetGetById,
    mockResolveAndHealTargetColumn,
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
  }),
}));

vi.mock('../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    getById: hoisted.mockDatasetGetById,
  }),
}));

vi.mock('../../utils/modelUtils.js', () => ({
  resolveAndHealTargetColumn: hoisted.mockResolveAndHealTargetColumn,
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
  readFile: vi.fn().mockResolvedValue('{"error_tree": {"node_id": 0, "error_rate": 0.25, "sample_count": 100, "error_count": 25}}'),
}));

const fsHoisted = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: fsHoisted.mockExistsSync,
    mkdirSync: vi.fn(),
  };
});

/* ------------------------------------------------------------------ */
/*  Import SUT (after mocks)                                           */
/* ------------------------------------------------------------------ */

import { buildErrorAnalysisScript, runErrorAnalysis } from '../errorAttributionService.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const {
  mockOrchestrateContainerExecution,
  mockCopyArtifactsToPermanentStorage,
  mockGetById,
  mockDatasetGetById,
  mockResolveAndHealTargetColumn,
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
    evaluationStatus: 'ready',
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
  fsHoisted.mockExistsSync.mockReset();
  fsHoisted.mockExistsSync.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe('buildErrorAnalysisScript', () => {
  it('returns valid Python for classification task type', () => {
    const script = buildErrorAnalysisScript({
      predictionsPath: '/workspace/eval/m1/predictions.parquet',
      outputDir: '/workspace/error-analysis/m1',
      targetColumn: 'target',
      taskType: 'classification',
    });

    // Must contain core imports
    expect(script).toContain('import json');
    expect(script).toContain('import pandas as pd');
    expect(script).toContain('import numpy as np');
    expect(script).toContain('from sklearn.tree import DecisionTreeClassifier');

    // Must contain parquet loading
    expect(script).toContain('pd.read_parquet');
    expect(script).toContain('predictions.parquet');

    // Must contain error tree logic
    expect(script).toContain('DecisionTreeClassifier(max_depth=4');
    expect(script).toContain('build_tree_node');
    expect(script).toContain("result['error_tree']");

    // Must save output
    expect(script).toContain('error_analysis.json');
    expect(script).toContain('json.dump');
  });

  it('includes DecisionTreeClassifier with max_depth=4', () => {
    const script = buildErrorAnalysisScript({
      predictionsPath: '/workspace/eval/m2/predictions.parquet',
      outputDir: '/workspace/error-analysis/m2',
      targetColumn: 'price',
      taskType: 'regression',
    });

    expect(script).toContain('DecisionTreeClassifier(max_depth=4, random_state=42)');
  });

  it('includes misclassification logic for classification', () => {
    const script = buildErrorAnalysisScript({
      predictionsPath: '/workspace/eval/m3/predictions.parquet',
      outputDir: '/workspace/error-analysis/m3',
      targetColumn: 'label',
      taskType: 'classification',
    });

    // Must include misclassification extraction
    expect(script).toContain('misclassifications');
    expect(script).toContain("task_type == 'classification'");
    expect(script).toContain('confidence');
    expect(script).toContain('.head(50)');
    expect(script).toContain("'y_true'");
    expect(script).toContain("'y_pred'");
  });

  it('handles the tree recursive structure correctly', () => {
    const script = buildErrorAnalysisScript({
      predictionsPath: '/workspace/eval/m4/predictions.parquet',
      outputDir: '/workspace/error-analysis/m4',
      targetColumn: 'target',
      taskType: 'classification',
    });

    // Must build tree nodes recursively
    expect(script).toContain('def build_tree_node(node_id=0)');
    expect(script).toContain('children_left');
    expect(script).toContain('children_right');
    expect(script).toContain("node['left'] = build_tree_node(left_child)");
    expect(script).toContain("node['right'] = build_tree_node(right_child)");
    expect(script).toContain("node['feature']");
    expect(script).toContain("node['threshold']");
    expect(script).toContain("'error_rate'");
    expect(script).toContain("'sample_count'");
    expect(script).toContain("'error_count'");
  });

  it('encodes paths correctly via JSON.stringify', () => {
    const script = buildErrorAnalysisScript({
      predictionsPath: '/workspace/eval/m5/predictions.parquet',
      outputDir: '/workspace/error-analysis/m5',
      targetColumn: 'species',
      taskType: 'classification',
    });

    expect(script).toContain('"/workspace/eval/m5/predictions.parquet"');
    expect(script).toContain('"/workspace/error-analysis/m5"');
    expect(script).toContain('"species"');
  });

  it('reads csv predictions when parquet is unavailable', () => {
    const script = buildErrorAnalysisScript({
      predictionsPath: '/workspace/eval/m6/predictions.csv',
      outputDir: '/workspace/error-analysis/m6',
      targetColumn: 'target',
      taskType: 'regression',
    });

    expect(script).toContain('pd.read_csv');
    expect(script).not.toContain('pd.read_parquet');
    expect(script).toContain('"/workspace/eval/m6/predictions.csv"');
  });
});

describe('runErrorAnalysis', () => {
  it('returns parsed error analysis on success', async () => {
    const model = makeModelRecord();
    const container = makeContainer();

    mockGetById.mockResolvedValue(model);
    mockDatasetGetById.mockResolvedValue({
      datasetId: 'test-dataset',
      columns: [{ name: 'feature1' }, { name: 'feature2' }, { name: 'target' }],
    });
    mockResolveAndHealTargetColumn.mockResolvedValue('target');
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'success',
        stderr: '',
        executionMs: 2000,
      },
    });
    mockCopyArtifactsToPermanentStorage.mockResolvedValue(undefined);

    const result = await runErrorAnalysis('test-model-id');

    expect(result).not.toBeNull();
    expect(result!.error_tree).toBeDefined();
    expect(result!.error_tree.node_id).toBe(0);
    expect(result!.error_tree.error_rate).toBe(0.25);
  });

  it('copies predictions into a workspace-relative eval directory before running analysis', async () => {
    const model = makeModelRecord();
    const container = makeContainer();

    mockGetById.mockResolvedValue(model);
    mockDatasetGetById.mockResolvedValue({
      datasetId: 'test-dataset',
      columns: [{ name: 'feature1' }, { name: 'feature2' }, { name: 'target' }],
    });
    mockResolveAndHealTargetColumn.mockResolvedValue('target');
    mockOrchestrateContainerExecution.mockImplementation(async (config: unknown) => {
      const cfg = config as { filesToCopy: Array<{ permanentPath: string; workspacePath: string }> };
      expect(cfg.filesToCopy).toEqual([
        {
          permanentPath: '/tmp/test-model-storage/test-model-id/predictions.parquet',
          workspacePath: 'eval/test-model-id/predictions.parquet',
        },
      ]);
      return {
        container,
        executionResult: {
          status: 'success',
          stderr: '',
          executionMs: 2000,
        },
      };
    });
    mockCopyArtifactsToPermanentStorage.mockResolvedValue(undefined);

    await runErrorAnalysis('test-model-id');

    expect(mockOrchestrateContainerExecution).toHaveBeenCalledTimes(1);
  });

  it('falls back to csv predictions when parquet is not present in storage', async () => {
    const model = makeModelRecord();
    const container = makeContainer();

    fsHoisted.mockExistsSync.mockImplementation((path: string) => path.endsWith('predictions.csv'));
    mockGetById.mockResolvedValue(model);
    mockDatasetGetById.mockResolvedValue({
      datasetId: 'test-dataset',
      columns: [{ name: 'feature1' }, { name: 'feature2' }, { name: 'target' }],
    });
    mockResolveAndHealTargetColumn.mockResolvedValue('target');
    mockOrchestrateContainerExecution.mockImplementation(async (config: unknown) => {
      const cfg = config as { filesToCopy: Array<{ permanentPath: string; workspacePath: string }>; scriptBuilder: () => string };
      expect(cfg.filesToCopy).toEqual([
        {
          permanentPath: '/tmp/test-model-storage/test-model-id/predictions.csv',
          workspacePath: 'eval/test-model-id/predictions.csv',
        },
      ]);
      expect(cfg.scriptBuilder()).toContain('pd.read_csv("/workspace/eval/test-model-id/predictions.csv")');
      return {
        container,
        executionResult: {
          status: 'success',
          stderr: '',
          executionMs: 2000,
        },
      };
    });
    mockCopyArtifactsToPermanentStorage.mockResolvedValue(undefined);

    await runErrorAnalysis('test-model-id');

    expect(mockOrchestrateContainerExecution).toHaveBeenCalledTimes(1);
  });

  it('returns null when model not found', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await runErrorAnalysis('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null when model has no artifact', async () => {
    const model = makeModelRecord({ artifact: undefined });
    mockGetById.mockResolvedValue(model);

    const result = await runErrorAnalysis('test-model-id');
    expect(result).toBeNull();
  });

  it('returns null when dataset not found', async () => {
    const model = makeModelRecord();
    mockGetById.mockResolvedValue(model);
    mockDatasetGetById.mockResolvedValue(undefined);

    const result = await runErrorAnalysis('test-model-id');
    expect(result).toBeNull();
  });

  it('returns null for clustering models', async () => {
    const model = makeModelRecord({ taskType: 'clustering' });
    mockGetById.mockResolvedValue(model);

    const result = await runErrorAnalysis('test-model-id');
    expect(result).toBeNull();
  });

  it('returns null on Docker execution failure', async () => {
    const model = makeModelRecord();
    const container = makeContainer();

    mockGetById.mockResolvedValue(model);
    mockDatasetGetById.mockResolvedValue({
      datasetId: 'test-dataset',
      columns: [{ name: 'feature1' }, { name: 'target' }],
    });
    mockResolveAndHealTargetColumn.mockResolvedValue('target');
    mockOrchestrateContainerExecution.mockResolvedValue({
      container,
      executionResult: {
        status: 'error',
        stderr: 'MemoryError',
        error: 'Execution failed',
        executionMs: 1000,
      },
    });

    const result = await runErrorAnalysis('test-model-id');
    expect(result).toBeNull();
  });
});
