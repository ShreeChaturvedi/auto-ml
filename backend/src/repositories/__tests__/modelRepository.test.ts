import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted PG mock                                                    */
/* ------------------------------------------------------------------ */

const hoisted = vi.hoisted(() => {
  const mockQuery = vi.fn();
  return { mockQuery };
});

vi.mock('../../db.js', () => ({
  getDbPool: () => ({ query: hoisted.mockQuery }),
  hasDatabaseConfiguration: () => true,
}));

vi.mock('../../logging/logger.js', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../config.js', () => ({
  env: {
    modelMetadataPath: '/tmp/test-models.json',
    databaseUrl: 'postgres://test',
  },
}));

vi.mock('../../utils/fs.js', () => ({
  ensureDirectoryForFile: vi.fn(),
}));

import type { ModelRecord } from '../../types/model.js';
import { PgModelRepository } from '../modelRepository.js';

const { mockQuery } = hoisted;

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('PgModelRepository', () => {
  let repo: PgModelRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PgModelRepository();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('create – JSONB serialization', () => {
    const baseInput: Omit<ModelRecord, 'modelId' | 'createdAt' | 'updatedAt'> = {
      projectId: 'proj-1',
      datasetId: 'ds-1',
      name: 'Test Model',
      templateId: 'random_forest_classifier',
      taskType: 'classification',
      library: 'sklearn',
      algorithm: 'RandomForestClassifier',
      parameters: { n_estimators: 100 },
      metrics: { accuracy: 0.95 },
      status: 'completed',
      featureColumns: ['age', 'income', 'credit_score'],
      sampleCount: 1000,
    };

    it('serializes featureColumns as JSON string, not PG array', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          model_id: 'test-id',
          project_id: 'proj-1',
          dataset_id: 'ds-1',
          name: 'Test Model',
          template_id: 'random_forest_classifier',
          task_type: 'classification',
          library: 'sklearn',
          algorithm: 'RandomForestClassifier',
          parameters: { n_estimators: 100 },
          metrics: { accuracy: 0.95 },
          status: 'completed',
          created_at: new Date(),
          updated_at: new Date(),
          feature_columns: ['age', 'income', 'credit_score'],
          sample_count: 1000,
        }],
      });

      await repo.create(baseInput);

      const params = mockQuery.mock.calls[0][1];
      // $15 is featureColumns — must be a JSON string, NOT a JS array
      const featureColumnsParam = params[14];
      expect(typeof featureColumnsParam).toBe('string');
      expect(featureColumnsParam).toBe('["age","income","credit_score"]');
    });

    it('passes null for undefined featureColumns', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { featureColumns: _fc, ...inputWithout } = baseInput;
      mockQuery.mockResolvedValueOnce({
        rows: [{
          model_id: 'test-id',
          project_id: 'proj-1',
          dataset_id: 'ds-1',
          name: 'Test Model',
          template_id: 'random_forest_classifier',
          task_type: 'classification',
          library: 'sklearn',
          algorithm: 'RandomForestClassifier',
          parameters: {},
          metrics: {},
          status: 'completed',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      await repo.create(inputWithout);

      const params = mockQuery.mock.calls[0][1];
      expect(params[14]).toBeNull();
    });
  });

  describe('update – JSONB serialization', () => {
    it('serializes featureColumns as JSON string in update', async () => {
      const existingModel: ModelRecord = {
        modelId: 'model-1',
        projectId: 'proj-1',
        datasetId: 'ds-1',
        name: 'Old Model',
        templateId: 'random_forest_classifier',
        taskType: 'classification',
        library: 'sklearn',
        algorithm: 'RandomForestClassifier',
        parameters: {},
        metrics: { accuracy: 0.9 },
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        featureColumns: ['age', 'income'],
      };

      // First query: getById
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          model_id: existingModel.modelId,
          project_id: existingModel.projectId,
          dataset_id: existingModel.datasetId,
          name: existingModel.name,
          template_id: existingModel.templateId,
          task_type: existingModel.taskType,
          library: existingModel.library,
          algorithm: existingModel.algorithm,
          parameters: existingModel.parameters,
          metrics: existingModel.metrics,
          status: existingModel.status,
          created_at: new Date(),
          updated_at: new Date(),
          feature_columns: existingModel.featureColumns,
        }],
      });

      // Second query: the UPDATE
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          model_id: existingModel.modelId,
          project_id: existingModel.projectId,
          dataset_id: existingModel.datasetId,
          name: 'Updated Model',
          template_id: existingModel.templateId,
          task_type: existingModel.taskType,
          library: existingModel.library,
          algorithm: existingModel.algorithm,
          parameters: existingModel.parameters,
          metrics: existingModel.metrics,
          status: existingModel.status,
          created_at: new Date(),
          updated_at: new Date(),
          feature_columns: ['age', 'income', 'score'],
        }],
      });

      await repo.update('model-1', (m) => ({
        ...m,
        name: 'Updated Model',
        featureColumns: ['age', 'income', 'score'],
      }));

      // The UPDATE query is the second call
      const updateParams = mockQuery.mock.calls[1][1];
      // $15 is featureColumns in the UPDATE
      const featureColumnsParam = updateParams[14];
      expect(typeof featureColumnsParam).toBe('string');
      expect(featureColumnsParam).toBe('["age","income","score"]');
    });
  });
});
