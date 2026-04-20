import express, { Router } from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';

import { describeRouteSuite } from '../tests/describeRouteSuite.js';
import type { EvaluationResult, ShapResult } from '../types/experiments.js';

// Mock fs/promises and repositories at the module level
const { mockReadFile, mockRunTuningStudy, mockCreateLlmClient, mockRunErrorAnalysis, mockRunEvaluation, mockRequestStructuredJson, mockListModels, mockGetModelById, mockUpdateModelRecord, mockGetProjectRepository } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockRunTuningStudy: vi.fn(),
  mockCreateLlmClient: vi.fn(),
  mockRunErrorAnalysis: vi.fn(),
  mockRunEvaluation: vi.fn(),
  mockRequestStructuredJson: vi.fn(),
  mockListModels: vi.fn(),
  mockGetModelById: vi.fn(),
  mockUpdateModelRecord: vi.fn(),
  mockGetProjectRepository: vi.fn(() => ({
    getById: vi.fn().mockResolvedValue({ id: 'project-1', name: 'Test Project', userId: null }),
    getByIdAndUser: vi.fn().mockResolvedValue({ id: 'project-1', name: 'Test Project', userId: 'user-1' }),
  })),
}));

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile
}));

vi.mock('../services/tuningService.js', () => ({
  runTuningStudy: mockRunTuningStudy,
}));

vi.mock('../services/llm/llmClient.js', () => ({
  createLlmClient: mockCreateLlmClient,
}));

vi.mock('../services/errorAttributionService.js', () => ({
  runErrorAnalysis: mockRunErrorAnalysis,
}));

vi.mock('../services/evaluationService.js', () => ({
  runEvaluation: mockRunEvaluation,
}));

vi.mock('../services/nlToSql/structuredRequest.js', () => ({
  requestStructuredJson: mockRequestStructuredJson,
}));

vi.mock('../services/modelTraining.js', () => ({
  getModelById: mockGetModelById,
  listModels: mockListModels,
  updateModelRecord: mockUpdateModelRecord,
}));

vi.mock('../repositories/projectRepository.js', () => ({
  getProjectRepository: mockGetProjectRepository,
}));

import { createExperimentsRouter } from './experiments.js';

const sampleEvaluation: EvaluationResult = {
  taskType: 'classification',
  timestamp: '2026-03-17T00:00:00.000Z',
  computeMs: 1234,
  feature_importance: {
    permutation: {
      features: ['feat_a', 'feat_b'],
      importances_mean: [0.3, 0.2],
      importances_std: [0.01, 0.02]
    }
  },
  learning_curve: {
    train_sizes: [100, 200],
    train_scores_mean: [0.8, 0.85],
    train_scores_std: [0.02, 0.01],
    test_scores_mean: [0.75, 0.82],
    test_scores_std: [0.03, 0.02]
  },
  cross_validation: {
    scores: [0.8, 0.82, 0.79],
    mean: 0.803,
    std: 0.012,
    scoring: 'accuracy'
  }
};

const sampleShap: ShapResult = {
  values: [[0.1, -0.2], [0.3, 0.05]],
  base_values: 0.5,
  data: [[1.0, 2.0], [3.0, 4.0]],
  feature_names: ['feat_a', 'feat_b'],
  mean_abs_values: [0.2, 0.125]
};

function createTestApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  // Add middleware to attach test user for protected routes
  app.use((req, res, next) => {
    // Allow routes to proceed without auth (projectRepository middleware handles unauth case)
    next();
  });
  router.use('/experiments', createExperimentsRouter());
  app.use('/api', router);
  return app;
}

describeRouteSuite('experiments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetModelById.mockResolvedValue(null);
    mockUpdateModelRecord.mockImplementation(async (_modelId: string, updater: (current: Record<string, unknown>) => Record<string, unknown>) => (
      updater({
        modelId: _modelId,
        projectId: 'project-1',
        evaluationStatus: 'ready',
      })
    ));
  });

  it('GET /experiments/:modelId/evaluation returns 200 with EvaluationResult when file exists', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify(sampleEvaluation));

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-abc/evaluation');

    expect(response.status).toBe(200);
    expect(response.body.taskType).toBe('classification');
    expect(response.body.computeMs).toBe(1234);
    expect(response.body.cross_validation.mean).toBe(0.803);
    expect(response.body.feature_importance.permutation.features).toEqual(['feat_a', 'feat_b']);
  });

  it('GET /experiments/:modelId/evaluation returns 404 when file is missing', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-missing/evaluation');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Evaluation not found');
  });

  it('GET /experiments/:modelId/evaluation returns 202 while evaluation is still pending', async () => {
    mockGetModelById.mockResolvedValueOnce({
      modelId: 'model-pending',
      projectId: 'project-1',
      evaluationStatus: 'pending',
    });
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-pending/evaluation');

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      status: 'pending',
      message: 'Evaluation is still being generated.',
    });
  });

  it('GET /experiments/:modelId/evaluation returns computing when status says ready but evaluation.json is missing', async () => {
    mockGetModelById.mockResolvedValueOnce({
      modelId: 'model-ready',
      projectId: 'project-1',
      evaluationStatus: 'ready',
    });
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-ready/evaluation');

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      status: 'computing',
      message: 'Evaluation artifacts are still being finalized.',
    });
  });

  it('GET /experiments/:modelId/shap returns 200 with ShapResult when file exists', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify(sampleShap));

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-abc/shap');

    expect(response.status).toBe(200);
    expect(response.body.feature_names).toEqual(['feat_a', 'feat_b']);
    expect(response.body.base_values).toBe(0.5);
    expect(response.body.values).toHaveLength(2);
    expect(response.body.mean_abs_values).toEqual([0.2, 0.125]);
  });

  it('GET /experiments/:modelId/shap returns 204 when file is missing', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-missing/shap');

    // Handler at routes/experiments.ts:162 intentionally returns 204 No Content
    // for missing shap.json so the frontend treats SHAP as an optional,
    // not-yet-computed resource rather than an error.
    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });

  it('POST /experiments/:modelId/evaluation/retry reruns evaluation and returns updated status', async () => {
    mockGetModelById
      .mockResolvedValueOnce({
        modelId: 'model-abc',
        projectId: 'project-1',
        evaluationStatus: 'failed',
      })
      .mockResolvedValueOnce({
        modelId: 'model-abc',
        projectId: 'project-1',
        evaluationStatus: 'ready',
      });
    mockRunEvaluation.mockResolvedValue(undefined);

    const app = createTestApp();
    const response = await request(app).post('/api/experiments/model-abc/evaluation/retry');

    expect(response.status).toBe(200);
    expect(mockRunEvaluation).toHaveBeenCalledWith('model-abc');
    expect(response.body).toEqual({ ok: true, evaluationStatus: 'ready' });
  });

  it('POST /experiments/:modelId/evaluation/retry keeps clustering evaluations ready without rerunning the evaluator', async () => {
    mockGetModelById
      .mockResolvedValueOnce({
        modelId: 'cluster-abc',
        projectId: 'project-1',
        taskType: 'clustering',
        evaluationStatus: 'failed',
      })
      .mockResolvedValueOnce({
        modelId: 'cluster-abc',
        projectId: 'project-1',
        taskType: 'clustering',
        evaluationStatus: 'ready',
      });
    mockReadFile.mockResolvedValueOnce(JSON.stringify({
      taskType: 'clustering',
      clustering_metrics: { n_clusters: 3, cluster_sizes: { '0': 5, '1': 4, '2': 6 } },
    }));

    const app = createTestApp();
    const response = await request(app).post('/api/experiments/cluster-abc/evaluation/retry');

    expect(response.status).toBe(200);
    expect(mockRunEvaluation).not.toHaveBeenCalled();
    expect(response.body).toEqual({ ok: true, evaluationStatus: 'ready' });
  });

  it('POST /experiments/:projectId/tune returns 400 when modelId is missing', async () => {
    const app = createTestApp();
    const response = await request(app).post('/api/experiments/project-1/tune').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('modelId');
  });

  it('POST /experiments/:projectId/tune returns 400 when nTrials is out of range', async () => {
    const app = createTestApp();
    const response = await request(app).post('/api/experiments/project-1/tune').send({
      modelId: 'model-1',
      nTrials: 300,
      metric: 'accuracy',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('nTrials');
  });

  it('POST /experiments/:projectId/compare returns 400 without modelIds', async () => {
    const app = createTestApp();
    const response = await request(app).post('/api/experiments/project-1/compare').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('modelIds');
  });

  it('POST /experiments/:projectId/compare returns 400 with only 1 model', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/compare')
      .send({ modelIds: ['model-1'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('modelIds');
  });

  it('POST /experiments/:projectId/compare returns 400 with more than 5 models', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/compare')
      .send({ modelIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('modelIds');
  });

  it('POST /experiments/:projectId/compare returns ComparisonResult for 2 models', async () => {
    const mockModels = [
      { modelId: 'model-a', projectId: 'project-1', name: 'RF', metrics: { accuracy: 0.92, f1: 0.90 } },
      { modelId: 'model-b', projectId: 'project-1', name: 'XGB', metrics: { accuracy: 0.95, f1: 0.93 } },
    ];
    mockListModels.mockResolvedValueOnce(mockModels);

    // Mock evaluation reads -- both fail (no eval data)
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/compare')
      .send({ modelIds: ['model-a', 'model-b'] });

    expect(response.status).toBe(200);
    expect(response.body.models).toHaveLength(2);
    expect(response.body.models[0].modelId).toBe('model-a');
    expect(response.body.models[1].modelId).toBe('model-b');
    expect(response.body.deltas).toHaveLength(2);

    const accDelta = response.body.deltas.find((d: { metric: string }) => d.metric === 'accuracy');
    expect(accDelta.delta).toBeCloseTo(0.03);
    expect(accDelta.values).toEqual([0.92, 0.95]);
  });

  it('POST /experiments/:projectId/compare includes p-values when evaluation data available', async () => {
    const mockModels = [
      { modelId: 'model-a', projectId: 'project-1', name: 'RF', metrics: { accuracy: 0.80 } },
      { modelId: 'model-b', projectId: 'project-1', name: 'XGB', metrics: { accuracy: 0.95 } },
    ];
    mockListModels.mockResolvedValueOnce(mockModels);

    const evalA = { ...sampleEvaluation, cross_validation: { scores: [0.78, 0.80, 0.82, 0.79, 0.81], mean: 0.80, std: 0.01, scoring: 'accuracy' } };
    const evalB = { ...sampleEvaluation, cross_validation: { scores: [0.94, 0.95, 0.96, 0.95, 0.95], mean: 0.95, std: 0.007, scoring: 'accuracy' } };

    // readFile is called for model-a and model-b evaluation files
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(evalA))
      .mockResolvedValueOnce(JSON.stringify(evalB));

    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/compare')
      .send({ modelIds: ['model-a', 'model-b'] });

    expect(response.status).toBe(200);
    const accDelta = response.body.deltas.find((d: { metric: string }) => d.metric === 'accuracy');
    expect(accDelta.pValue).toBeDefined();
    expect(typeof accDelta.pValue).toBe('number');
    expect(accDelta.significant).toBe(true);
  });

  it('POST /experiments/:projectId/compare returns 404 when models not found', async () => {
    mockListModels.mockResolvedValueOnce([]);

    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/compare')
      .send({ modelIds: ['model-a', 'model-b'] });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain('at least 2');
  });

  it('POST /experiments/:projectId/insights with type=banner returns NDJSON stream', async () => {
    const mockStream = vi.fn().mockImplementation((_request, handlers) => {
      handlers.onToken('Hello ');
      handlers.onToken('world');
      return Promise.resolve('Hello world');
    });
    mockCreateLlmClient.mockReturnValue({ stream: mockStream });

    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/insights')
      .send({ type: 'banner', context: { models: [{ name: 'RF', accuracy: 0.92 }] } });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');

    const lines = response.text.trim().split('\n').map((line: string) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ type: 'token', content: 'Hello ' });
    expect(lines[1]).toEqual({ type: 'token', content: 'world' });
    expect(lines[2]).toEqual({ type: 'done' });
  });

  it('POST /experiments/:projectId/insights without type returns 400', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/insights')
      .send({ context: {} });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('type is required');
  });

  it('POST /experiments/:projectId/insights returns 200 with error event when LLM fails (graceful degradation)', async () => {
    mockCreateLlmClient.mockReturnValue({
      stream: vi.fn().mockRejectedValue(new Error('API key invalid')),
    });

    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/insights')
      .send({ type: 'banner', context: {} });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');

    const lines = response.text.trim().split('\n').map((line: string) => JSON.parse(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ type: 'error' });
  });

  it('GET /experiments/:modelId/error-analysis returns cached result from disk', async () => {
    const sampleErrorAnalysis = {
      error_tree: { node_id: 0, error_rate: 0.25, sample_count: 100, error_count: 25 },
      misclassifications: [],
    };
    mockReadFile.mockResolvedValueOnce(JSON.stringify(sampleErrorAnalysis));

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-abc/error-analysis');

    expect(response.status).toBe(200);
    expect(response.body.error_tree.node_id).toBe(0);
    expect(response.body.error_tree.error_rate).toBe(0.25);
  });

  it('GET /experiments/:modelId/error-analysis returns 200 with available:false when analysis unavailable', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    mockRunErrorAnalysis.mockResolvedValueOnce(null);

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-abc/error-analysis');

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
  });

  it('GET /experiments/:modelId/error-analysis runs on-demand when not cached', async () => {
    const onDemandResult = {
      error_tree: { node_id: 0, error_rate: 0.3, sample_count: 200, error_count: 60 },
      misclassifications: [{ index: 5, y_true: 'A', y_pred: 'B', confidence: 0.9, top_shap_contributors: [] }],
    };
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    mockRunErrorAnalysis.mockResolvedValueOnce(onDemandResult);

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-abc/error-analysis');

    expect(response.status).toBe(200);
    expect(response.body.error_tree.error_rate).toBe(0.3);
    expect(response.body.misclassifications).toHaveLength(1);
    expect(mockRunErrorAnalysis).toHaveBeenCalledWith('model-abc');
  });

  // ── NL Filter endpoint tests ──────────────────────────────────────

  it('POST /experiments/:projectId/nl-filter returns predicates on valid query', async () => {
    mockListModels.mockResolvedValueOnce([]);
    mockRequestStructuredJson.mockResolvedValueOnce({
      predicates: [{ field: 'accuracy', operator: 'gt', value: 0.9 }],
    });

    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/nl-filter')
      .send({ query: 'accuracy above 0.9' });

    expect(response.status).toBe(200);
    expect(response.body.predicates).toHaveLength(1);
    expect(response.body.predicates[0]).toEqual({ field: 'accuracy', operator: 'gt', value: 0.9 });
  });

  it('POST /experiments/:projectId/nl-filter returns 400 when query is missing', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/nl-filter')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('query is required');
  });

  it('POST /experiments/:projectId/nl-filter returns empty predicates when LLM returns none', async () => {
    mockListModels.mockResolvedValueOnce([]);
    mockRequestStructuredJson.mockResolvedValueOnce({ predicates: [] });

    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/nl-filter')
      .send({ query: 'show the best model' });

    expect(response.status).toBe(200);
    expect(response.body.predicates).toEqual([]);
  });

  it('POST /experiments/:projectId/nl-filter returns empty predicates on LLM failure (never 500)', async () => {
    mockListModels.mockResolvedValueOnce([]);
    mockRequestStructuredJson.mockRejectedValueOnce(new Error('Validation failed after 2 attempts'));

    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/nl-filter')
      .send({ query: 'something weird' });

    expect(response.status).toBe(200);
    expect(response.body.predicates).toEqual([]);
  });

  it('POST /experiments/:projectId/nl-filter returns 400 for empty string query', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/experiments/project-1/nl-filter')
      .send({ query: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('query is required');
  });
});
