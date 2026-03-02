import { Router } from 'express';

import { env } from '../config.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { sanitizeTableName } from '../services/datasetLoader.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

export function createPreprocessingRouter() {
  const router = Router();

  const deprecatedResponse = {
    error: 'Legacy preprocessing endpoint is deprecated.',
    code: 'PREPROCESSING_LEGACY_ENDPOINT_DEPRECATED',
    migrationPath: '/api/llm/preprocessing/stream',
    message:
      'Use the tool-orchestrated preprocessing flow via /api/llm/preprocessing/stream and /api/llm/tools/execute.'
  };

  router.post('/preprocessing/analyze', (_req, res) => {
    return res.status(410).json(deprecatedResponse);
  });

  router.post('/preprocessing/refine', (_req, res) => {
    return res.status(410).json(deprecatedResponse);
  });

  router.post('/preprocessing/execute', (_req, res) => {
    return res.status(410).json(deprecatedResponse);
  });

  router.get('/preprocessing/tables', async (req, res) => {

    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      let datasets = await datasetRepository.list();
      if (projectId) {
        datasets = datasets.filter((dataset) => dataset.projectId === projectId);
      }

      const tables = datasets.map((dataset) => ({
        datasetId: dataset.datasetId,
        name:
          typeof dataset.metadata?.tableName === 'string'
            ? dataset.metadata.tableName
            : sanitizeTableName(dataset.filename, dataset.datasetId),
        filename: dataset.filename,
        sizeBytes: dataset.size,
        nRows: dataset.nRows,
        nCols: dataset.nCols,
        columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
        previewRows: dataset.sample?.slice(0, 5) ?? []
      }));

      return res.json({ tables });
    } catch (error) {
      console.error('[preprocessing] Failed to list tables:', error);
      return res.status(500).json({ error: 'Failed to list tables' });
    }
  });

  return router;
}
