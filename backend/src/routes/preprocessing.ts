import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { sanitizeTableName } from '../services/datasetLoader.js';
import {
  analyzePreprocessingPipeline,
  executePreprocessingPipeline,
  preprocessingStepSchema,
  refinePreprocessingPipeline
} from '../services/preprocessingPipeline.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

const analyzeSchema = z.object({
  projectId: z.string().uuid('projectId must be a valid UUID'),
  datasetId: z.string().min(1),
  sampleSize: z.number().int().min(10).max(100).optional().default(20)
});

const refineSchema = z.object({
  projectId: z.string().uuid('projectId must be a valid UUID'),
  datasetId: z.string().min(1),
  message: z.string().min(1).max(2000),
  draftSteps: z.array(preprocessingStepSchema).max(50),
  model: z.string().min(1).optional(),
  enableThinking: z.boolean().optional(),
  thinkingLevel: z.enum(['dynamic', 'low', 'medium', 'high']).optional()
});

const executeSchema = z.object({
  projectId: z.string().uuid('projectId must be a valid UUID'),
  datasetId: z.string().min(1),
  draftSteps: z.array(preprocessingStepSchema).max(50),
  outputName: z.string().min(1).max(128).optional()
});

export function createPreprocessingRouter() {
  const router = Router();

  router.post('/preprocessing/analyze', async (req, res) => {
    const result = analyzeSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    try {
      const response = await analyzePreprocessingPipeline(result.data);
      return res.json(response);
    } catch (error) {
      console.error('[preprocessing] Analysis failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to analyze dataset';
      return res.status(400).json({ error: message });
    }
  });

  router.post('/preprocessing/refine', async (req, res) => {
    const result = refineSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    try {
      const response = await refinePreprocessingPipeline(result.data);
      return res.json(response);
    } catch (error) {
      console.error('[preprocessing] Refine failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to refine pipeline';
      return res.status(400).json({ error: message });
    }
  });

  router.post('/preprocessing/execute', async (req, res) => {
    const result = executeSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    try {
      const response = await executePreprocessingPipeline(result.data);
      return res.json(response);
    } catch (error) {
      console.error('[preprocessing] Execution failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to execute preprocessing pipeline';
      return res.status(400).json({ error: message });
    }
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
