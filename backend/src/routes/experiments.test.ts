import express, { Router } from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';

import { describeRouteSuite } from '../tests/describeRouteSuite.js';
import type { EvaluationResult, ShapResult } from '../types/experiments.js';

// Mock fs/promises at the module level
const { mockReadFile, mockRunTuningStudy, mockCreateLlmClient, mockRunErrorAnalysis } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockRunTuningStudy: vi.fn(),
  mockCreateLlmClient: vi.fn(),
  mockRunErrorAnalysis: vi.fn(),
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
  router.use('/experiments', createExperimentsRouter());
  app.use('/api', router);
  return app;
}

describeRouteSuite('experiments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('GET /experiments/:modelId/shap returns 404 when file is missing', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-missing/shap');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('SHAP data not found');
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

  it('POST /experiments/:projectId/compare returns 501', async () => {
    const app = createTestApp();
    const response = await request(app).post('/api/experiments/project-1/compare');

    expect(response.status).toBe(501);
    expect(response.body.error).toBe('Not implemented');
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

  it('GET /experiments/:modelId/error-analysis returns 404 when analysis unavailable', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    mockRunErrorAnalysis.mockResolvedValueOnce(null);

    const app = createTestApp();
    const response = await request(app).get('/api/experiments/model-abc/error-analysis');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Error analysis not available');
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
});
