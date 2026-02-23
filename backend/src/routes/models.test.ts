import express, { Router } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockTemplates, mockModel } = vi.hoisted(() => ({
  mockTemplates: [
    {
      id: 'random_forest_classifier',
      name: 'Random Forest',
      taskType: 'classification',
      description: 'Mock',
      library: 'sklearn',
      importPath: 'sklearn.ensemble',
      modelClass: 'RandomForestClassifier',
      parameters: [],
      defaultParams: {},
      metrics: ['accuracy']
    }
  ],
  mockModel: {
    modelId: 'model-123',
    projectId: 'project-1',
    datasetId: 'dataset-1',
    name: 'Mock model',
    templateId: 'random_forest_classifier',
    taskType: 'classification',
    library: 'sklearn',
    algorithm: 'RandomForestClassifier',
    parameters: {},
    metrics: { accuracy: 0.9 },
    status: 'completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}));

vi.mock('../services/modelTraining.js', () => ({
  getModelTemplates: () => mockTemplates,
  listModels: vi.fn(async () => [mockModel]),
  getModelById: vi.fn(async (id: string) => (id === mockModel.modelId ? mockModel : undefined)),
  trainModel: vi.fn(async () => ({ model: mockModel, success: true, message: 'ok' }))
}));

import { canListen } from '../tests/canListen.js';
import modelRouter from './models.js';

const canBind = await canListen();
const describeIf = canBind ? describe : describe.skip;

function createTestApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  router.use('/models', modelRouter);
  app.use('/api', router);
  return app;
}

describeIf('model routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists templates', async () => {
    const app = createTestApp();
    const response = await request(app).get('/api/models/templates');

    expect(response.status).toBe(200);
    expect(response.body.templates).toHaveLength(1);
    expect(response.body.templates[0].id).toBe('random_forest_classifier');
  });

  it('lists models', async () => {
    const app = createTestApp();
    const response = await request(app).get('/api/models');

    expect(response.status).toBe(200);
    expect(response.body.models).toHaveLength(1);
    expect(response.body.models[0].modelId).toBe(mockModel.modelId);
  });

  it('returns 404 for missing model', async () => {
    const app = createTestApp();
    const response = await request(app).get('/api/models/missing');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Model not found');
  });

  it('validates training requests', async () => {
    const app = createTestApp();
    const response = await request(app).post('/api/models/train').send({ projectId: 'p1' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request');
  });

  it('trains a model', async () => {
    const app = createTestApp();
    const response = await request(app).post('/api/models/train').send({
      projectId: 'project-1',
      datasetId: 'dataset-1',
      templateId: 'random_forest_classifier',
      targetColumn: 'target'
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.model.modelId).toBe(mockModel.modelId);
  });
});
