import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';

import { describeRouteSuite } from '../tests/describeRouteSuite.js';

import { createPreprocessingRouter } from './preprocessing.js';

const { listMock, listByProjectMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  listByProjectMock: vi.fn()
}));

vi.mock('../repositories/datasetRepository.js', () => ({
  createDatasetRepository: vi.fn(() => ({
    list: listMock,
    listByProject: listByProjectMock
  }))
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createPreprocessingRouter());
  return app;
}

describeRouteSuite('preprocessing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([]);
    listByProjectMock.mockResolvedValue([]);
  });

  it('returns 404 for removed legacy analyze endpoint', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/preprocessing/analyze')
      .send({ projectId: 'project-1', datasetId: 'dataset-1' });

    expect(response.status).toBe(404);
  });

  it('returns 404 for removed legacy refine endpoint', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/preprocessing/refine')
      .send({ projectId: 'project-1', datasetId: 'dataset-1', message: 'refine', draftSteps: [] });

    expect(response.status).toBe(404);
  });

  it('returns 404 for removed legacy execute endpoint', async () => {
    const app = createTestApp();
    const response = await request(app)
      .post('/api/preprocessing/execute')
      .send({ projectId: 'project-1', datasetId: 'dataset-1', draftSteps: [] });

    expect(response.status).toBe(404);
  });

  it('keeps preprocessing tables endpoint available', async () => {
    listByProjectMock.mockResolvedValue([
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
