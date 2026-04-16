import { mkdir, mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowRunState, WorkflowTurnRequest } from '../../workflows/types.js';

import type { TrainingToolContext } from './types.js';

// Mock dependencies before importing the module under test. The model
// repository is in-memory-backed by a Map so update/delete semantics match
// production (file/postgres repos have the same interface and the artifact
// bridge logic is storage-agnostic).
const repoStore = new Map<string, Record<string, unknown>>();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../repositories/modelRepository.js', () => ({
  createModelRepository: () => ({
    create: mockCreate,
    list: vi.fn(async () => Array.from(repoStore.values())),
    getById: vi.fn(async (id: string) => repoStore.get(id)),
    update: mockUpdate,
    delete: mockDelete,
    clear: vi.fn(async () => repoStore.clear())
  })
}));

vi.mock('../../evaluationService.js', () => ({
  runEvaluation: vi.fn(async () => undefined)
}));

// workspace/storage dirs are replaced per-test so each case gets an isolated
// filesystem. The shared env object is mutated via vi.doMock after the
// tmpdir is created.
let tmpRoot: string;
let workspaceDir: string;
let storageDir: string;

vi.mock('../../../config.js', () => ({
  env: {
    get modelMetadataPath() { return '/tmp/test-models.json'; },
    get modelStorageDir() { return storageDir; },
    get executionWorkspaceDir() { return workspaceDir; }
  }
}));

// Now import after mocks are set up
const { registerModel } = await import('./registrationTools.js');

function buildRun(): WorkflowRunState {
  return {
    runId: 'run-1',
    threadId: 'thread-1',
    projectId: 'project-1',
    phase: 'training',
    status: 'running',
    currentNode: 'register_model',
    revision: 1,
    retryBudget: 3,
    repairAttemptCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      experiments: {
        'exp-1': {
          experimentId: 'exp-1',
          experimentName: 'Random Forest Baseline',
          modelType: 'random_forest',
          status: 'evaluated',
          targetColumn: 'target',
          featureColumns: ['feat1', 'feat2'],
          workflowPrepSegments: ['df = pd.read_csv("data.csv")', 'X_train = df[["feat1", "feat2"]].copy()'],
          trainingDurationMs: 1200,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    }
  };
}

function buildTurn(): WorkflowTurnRequest {
  return {
    projectId: 'project-1',
    phase: 'training',
    datasetId: 'dataset-1',
    prompt: 'Register the model'
  };
}

function buildCtx(args: Record<string, unknown>, runOverride?: WorkflowRunState): TrainingToolContext {
  return {
    projectId: 'project-1',
    toolCallId: 'tc-1',
    args,
    datasetId: 'dataset-1',
    run: runOverride ?? buildRun(),
    turn: buildTurn()
  };
}

describe('registerModel', () => {
  beforeEach(async () => {
    repoStore.clear();
    tmpRoot = await mkdtemp(join(tmpdir(), 'register-model-test-'));
    workspaceDir = join(tmpRoot, 'workspace');
    storageDir = join(tmpRoot, 'storage');
    await mkdir(join(workspaceDir, 'project-1'), { recursive: true });
    await mkdir(storageDir, { recursive: true });

    mockCreate.mockReset();
    mockCreate.mockImplementation(async (record: Record<string, unknown>) => {
      const modelId = 'model-uuid-1';
      const full = { ...record, modelId, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      repoStore.set(modelId, full);
      return full;
    });

    mockUpdate.mockReset();
    mockUpdate.mockImplementation(async (modelId: string, updater: (current: Record<string, unknown>) => Record<string, unknown>) => {
      const current = repoStore.get(modelId);
      if (!current) return undefined;
      const updated = { ...updater(current), modelId: current.modelId, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
      repoStore.set(modelId, updated);
      return updated;
    });

    mockDelete.mockReset();
    mockDelete.mockImplementation(async (modelId: string) => repoStore.delete(modelId));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('copies the artifact from the project workspace into permanent storage and stores the real path + size', async () => {
    // Write a fake joblib blob to the sandbox workspace at the relative
    // filename the LLM is instructed to use.
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    const payload = Buffer.from('fake sklearn pipeline bytes');
    await writeFile(sourcePath, payload);

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF Baseline',
      modelType: 'random_forest',
      metrics: { accuracy: 0.92, f1: 0.89 },
      hyperparameters: { n_estimators: 100 },
      artifactPath: 'model.joblib',
      tags: ['baseline']
    }));

    expect(result.error).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // The final model record must point at the permanent storage path.
    const record = repoStore.get('model-uuid-1')!;
    const artifact = record.artifact as { filename: string; path: string; size: number };
    expect(artifact).toBeDefined();
    expect(artifact.filename).toBe('model.joblib');
    expect(artifact.path).toBe(join(storageDir, 'model-uuid-1', 'model.joblib'));
    expect(artifact.size).toBe(payload.length); // real stat, not hardcoded 0

    // Permanent file must actually exist on disk.
    const permanentStat = await stat(artifact.path);
    expect(permanentStat.isFile()).toBe(true);
    expect(permanentStat.size).toBe(payload.length);

    // Tool output must report the permanent path so the chat can surface it,
    // plus the modelId and taskType so the Training chat "Open in Experiments"
    // button can route to the correct ModelDetailPanel.
    const output = result.output as Record<string, unknown>;
    expect(output.modelId).toBe('model-uuid-1');
    expect(output.taskType).toBe('classification'); // random_forest inferred
    expect(output.artifactPath).toBe(artifact.path);
    expect(output.artifactSize).toBe(payload.length);
  });

  it('persists to model repository via modelRepository.create()', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF Baseline',
      modelType: 'random_forest',
      metrics: { accuracy: 0.92, f1: 0.89 },
      hyperparameters: { n_estimators: 100 },
      artifactPath: 'model.joblib',
      tags: ['baseline']
    }));

    expect(result.error).toBeUndefined();
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.projectId).toBe('project-1');
    expect(createArg.datasetId).toBe('dataset-1');
    expect(createArg.name).toBe('RF Baseline');
    expect(createArg.metrics).toEqual({ accuracy: 0.92, f1: 0.89 });
    expect(createArg.parameters).toEqual({ n_estimators: 100 });
    expect(createArg.status).toBe('completed');
    expect(createArg.evaluationStatus).toBe('pending');
    expect(createArg.featureColumns).toEqual(['feat1', 'feat2']);
    expect(createArg.metadata).toEqual(expect.objectContaining({
      workflowRunId: 'run-1',
      experimentId: 'exp-1',
      source: 'llm-workflow',
      tags: ['baseline'],
      workflowPrepSegments: ['df = pd.read_csv("data.csv")', 'X_train = df[["feat1", "feat2"]].copy()']
    }));
  });

  it('persists training-time runtime dependencies for non-bundled model libraries', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const run = buildRun();
    run.metadata = {
      ...(run.metadata ?? {}),
      history: {
        toolCalls: [
          { tool: 'install_package', args: { packageName: 'catboost' } }
        ],
        toolResults: [
          { tool: 'install_package', output: { success: true, message: 'Successfully installed catboost' } }
        ]
      }
    };

    const ctx = buildCtx({
      experimentId: 'exp-1',
      modelName: 'CatBoost Baseline',
      modelType: 'catboost',
      metrics: { accuracy: 0.91, f1: 0.88 },
      artifactPath: 'model.joblib'
    }, run);

    const result = await registerModel(ctx);

    expect(result.error).toBeUndefined();
    const createArg = mockCreate.mock.calls.at(-1)?.[0];
    expect(createArg.metadata).toEqual(expect.objectContaining({
      runtimeDependencies: ['catboost']
    }));

    const experiments = ctx.run.metadata?.experiments as Record<string, Record<string, unknown>>;
    expect(experiments['exp-1'].modelType).toBe('catboost');
    expect(experiments['exp-1'].registeredModelType).toBe('catboost');
    expect(experiments['exp-1'].runtimeDependencies).toEqual(['catboost']);
  });

  it('stores persistedModelId on experiment state', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const ctx = buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 },
      artifactPath: 'model.joblib'
    });

    await registerModel(ctx);

    const experiments = ctx.run.metadata?.experiments as Record<string, Record<string, unknown>>;
    expect(experiments['exp-1'].persistedModelId).toBe('model-uuid-1');
  });

  it('classifies logistic_regression as classification (not regression)', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'LogReg Baseline',
      modelType: 'logistic_regression',
      metrics: { accuracy: 0.89, f1: 0.84 },
      artifactPath: 'model.joblib'
    }));

    expect(result.error).toBeUndefined();
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.taskType).toBe('classification');
    expect(createArg.templateId).toBe('logistic_regression');
  });

  it('stores canonical template IDs for supported llm workflow families', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF Baseline',
      modelType: 'random_forest',
      metrics: { accuracy: 0.91, f1: 0.87 },
      artifactPath: 'model.joblib'
    }));

    expect(result.error).toBeUndefined();
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.templateId).toBe('random_forest_classifier');
  });

  it('keeps llm-prefixed template IDs for unsupported tuning families', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'LightGBM Baseline',
      modelType: 'lightgbm',
      metrics: { r2: 0.74 },
      artifactPath: 'model.joblib'
    }));

    expect(result.error).toBeUndefined();
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.templateId).toBe('llm-lightgbm');
  });

  it('falls back to evaluate_results metrics when register_model receives an empty metrics object', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const run = buildRun();
    const experiments = run.metadata?.experiments as Record<string, Record<string, unknown>>;
    experiments['exp-1'].evaluationMetrics = { accuracy: 0.91, f1: 0.87 };

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF Baseline',
      modelType: 'random_forest',
      metrics: {},
      artifactPath: 'model.joblib'
    }, run));

    expect(result.error).toBeUndefined();
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.metrics).toEqual({ accuracy: 0.91, f1: 0.87 });
  });

  it('coerces numeric-string metrics from evaluate_results fallback', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const run = buildRun();
    const experiments = run.metadata?.experiments as Record<string, Record<string, unknown>>;
    experiments['exp-1'].evaluationMetrics = { accuracy: '0.91', macro_f1: '0.87' };

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF Baseline',
      modelType: 'random_forest',
      metrics: {},
      artifactPath: 'model.joblib'
    }, run));

    expect(result.error).toBeUndefined();
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.metrics).toEqual({ accuracy: 0.91, macro_f1: 0.87 });
  });

  it('returns error when experimentId is missing', async () => {
    const result = await registerModel(buildCtx({
      modelName: 'RF',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 }
    }));

    expect(result.error).toBeDefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('surfaces an error and rolls back the record when repository create fails', async () => {
    // Inverted from the pre-sprint11 behavior that silently swallowed DB
    // errors. Was titled "does not block workflow when repository write
    // fails" and asserted result.error was undefined. That enshrined the
    // silent-success bug: users saw "registered" in chat while nothing
    // landed in Postgres. The new contract is: DB failures bubble up as
    // tool errors so the LLM can tell the user exactly what went wrong.
    mockCreate.mockRejectedValue(new Error('DB write failed'));
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const ctx = buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 },
      artifactPath: 'model.joblib'
    });
    const result = await registerModel(ctx);

    expect(result.error).toBeDefined();
    expect(result.error).toContain('DB write failed');
    expect(result.output).toBeUndefined();
    const experiments = ctx.run.metadata?.experiments as Record<string, Record<string, unknown>>;
    expect(experiments['exp-1'].status).toBe('evaluated');
    expect(experiments['exp-1'].registeredMetrics).toBeUndefined();
  });

  it('returns an error and does not create the record when artifactPath points at a missing file', async () => {
    // Source file never created — the LLM supposedly saved to model.joblib
    // but the cell never ran (or ran to a different path). We fail fast
    // BEFORE creating the record so the Experiments tab never shows a row
    // with a dangling artifact path.
    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 },
      artifactPath: 'model.joblib'
    }));

    expect(result.error).toBeDefined();
    expect(result.error).toContain('could not locate the model artifact');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects absolute artifact paths', async () => {
    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 },
      artifactPath: '/etc/passwd'
    }));

    expect(result.error).toBeDefined();
    expect(result.error).toContain('relative path');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects path-traversal escapes', async () => {
    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 },
      artifactPath: '../../etc/passwd'
    }));

    expect(result.error).toBeDefined();
    expect(result.error).toContain('outside the project workspace');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects empty artifactPath', async () => {
    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 },
      artifactPath: '   '
    }));

    expect(result.error).toBeDefined();
    expect(result.error).toContain('requires artifactPath');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('requires artifactPath so Experiments always receives a persisted model artifact', async () => {
    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'KMeans Clusters',
      modelType: 'kmeans',
      metrics: { silhouette: 0.42 }
    }));

    expect(result.error).toBeDefined();
    expect(result.error).toContain('requires artifactPath');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('resolves artifacts saved inside session-scoped subdirectories', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'session-123', 'artifacts', 'model.joblib');
    await mkdir(join(workspaceDir, 'project-1', 'session-123', 'artifacts'), { recursive: true });
    await writeFile(sourcePath, Buffer.from('session-scope'));

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF Baseline',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 },
      artifactPath: 'artifacts/model.joblib'
    }));

    expect(result.error).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('errors when no numeric metrics are available from register_model or evaluation state', async () => {
    const sourcePath = join(workspaceDir, 'project-1', 'model.joblib');
    await writeFile(sourcePath, Buffer.from('x'));

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF Baseline',
      modelType: 'random_forest',
      metrics: {},
      artifactPath: 'model.joblib'
    }));

    expect(result.error).toBeDefined();
    expect(result.error).toContain('requires non-empty numeric metrics');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
