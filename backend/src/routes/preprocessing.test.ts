import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canListen } from '../tests/canListen.js';

import { createPreprocessingRouter } from './preprocessing.js';

const { listMock } = vi.hoisted(() => ({
  listMock: vi.fn()
}));

vi.mock('../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => ({
    list: listMock
  }))
}));

const canBind = await canListen();
const describeIf = canBind ? describe : describe.skip;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createPreprocessingRouter());
  return app;
}

describeIf('preprocessing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([]);
  });

  it('returns 410 for legacy analyze endpoint', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/preprocessing/analyze')
      .send({ projectId: 'project-1', datasetId: 'dataset-1' });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('PREPROCESSING_LEGACY_ENDPOINT_DEPRECATED');
  });

  it('returns 410 for legacy refine endpoint', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/preprocessing/refine')
      .send({ projectId: 'project-1', datasetId: 'dataset-1', message: 'refine', draftSteps: [] });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('PREPROCESSING_LEGACY_ENDPOINT_DEPRECATED');
  });

  it('returns 410 for legacy execute endpoint', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/preprocessing/execute')
      .send({ projectId: 'project-1', datasetId: 'dataset-1', draftSteps: [] });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('PREPROCESSING_LEGACY_ENDPOINT_DEPRECATED');
  });

  it('keeps preprocessing tables endpoint available', async () => {
    listMock.mockResolvedValue([
      {
        datasetId: 'dataset-1',
        projectId: 'project-1',
        filename: 'train.csv',
        size: 123,
        nRows: 10,
        nCols: 2,
        columns: [
          { name: 'age', dtype: 'integer' },
          { name: 'income', dtype: 'float' }
        ],
        sample: [{ age: 31, income: 10.5 }],
        metadata: {}
      }
    ]);

    const app = createTestApp();
    const response = await request(app)
      .get('/api/preprocessing/tables')
      .query({ projectId: 'project-1' });

    expect(response.status).toBe(200);
    expect(response.body.tables).toHaveLength(1);
    expect(response.body.tables[0]).toMatchObject({
      datasetId: 'dataset-1',
      filename: 'train.csv',
      nRows: 10,
      nCols: 2
    });
  });
});
