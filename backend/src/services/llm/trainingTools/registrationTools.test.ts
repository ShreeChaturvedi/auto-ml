import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowRunState, WorkflowTurnRequest } from '../../workflows/types.js';

import type { TrainingToolContext } from './types.js';

// Mock dependencies before importing the module under test
const mockCreate = vi.fn();
vi.mock('../../../repositories/modelRepository.js', () => ({
  createModelRepository: () => ({
    create: mockCreate,
    list: vi.fn(async () => []),
    getById: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => false),
    clear: vi.fn(async () => undefined)
  })
}));

vi.mock('../../evaluationService.js', () => ({
  runEvaluation: vi.fn(async () => undefined)
}));

vi.mock('../../../config.js', () => ({
  env: { modelMetadataPath: '/tmp/test-models.json' }
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

function buildCtx(args: Record<string, unknown>): TrainingToolContext {
  return {
    projectId: 'project-1',
    toolCallId: 'tc-1',
    args,
    datasetId: 'dataset-1',
    run: buildRun(),
    turn: buildTurn()
  };
}

describe('registerModel', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      modelId: 'model-uuid-1',
      projectId: 'project-1',
      name: 'RF Baseline',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  it('persists to model repository via modelRepository.create()', async () => {
    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF Baseline',
      modelType: 'random_forest',
      metrics: { accuracy: 0.92, f1: 0.89 },
      hyperparameters: { n_estimators: 100 },
      tags: ['baseline']
    }));

    expect(result.error).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.projectId).toBe('project-1');
    expect(createArg.datasetId).toBe('dataset-1');
    expect(createArg.name).toBe('RF Baseline');
    expect(createArg.metrics).toEqual({ accuracy: 0.92, f1: 0.89 });
    expect(createArg.parameters).toEqual({ n_estimators: 100 });
    expect(createArg.status).toBe('completed');
    expect(createArg.evaluationStatus).toBe('pending');
    expect(createArg.metadata).toEqual(expect.objectContaining({
      experimentId: 'exp-1',
      source: 'llm-workflow',
      tags: ['baseline']
    }));
  });

  it('includes artifact when artifactPath is provided', async () => {
    await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF Baseline',
      modelType: 'random_forest',
      metrics: { accuracy: 0.92 },
      artifactPath: '/workspace/models/abc/model.joblib'
    }));

    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.artifact).toEqual({
      filename: 'model.joblib',
      path: '/workspace/models/abc/model.joblib',
      size: 0
    });
  });

  it('stores persistedModelId on experiment state', async () => {
    const ctx = buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 }
    });

    await registerModel(ctx);

    const experiments = ctx.run.metadata?.experiments as Record<string, Record<string, unknown>>;
    expect(experiments['exp-1'].persistedModelId).toBe('model-uuid-1');
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

  it('does not block workflow when repository write fails', async () => {
    mockCreate.mockRejectedValue(new Error('DB write failed'));

    const result = await registerModel(buildCtx({
      experimentId: 'exp-1',
      modelName: 'RF',
      modelType: 'random_forest',
      metrics: { accuracy: 0.9 }
    }));

    // Should still succeed from the workflow perspective
    expect(result.error).toBeUndefined();
    expect(result.output).toBeDefined();
  });
});
