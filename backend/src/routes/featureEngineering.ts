/**
 * Feature Engineering Routes
 *
 * Apply engineered features to datasets using the Python runtime.
 */

import { Router } from 'express';
import { z } from 'zod';

import { applyFeatureEngineering, FEATURE_METHODS } from '../services/featureEngineering.js';
import { sanitizeTableName } from '../services/datasetLoader.js';

const featureSpecSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  sourceColumn: z.string().min(1),
  secondaryColumn: z.string().optional(),
  featureName: z.string().min(1),
  description: z.string().optional(),
  method: z.enum(FEATURE_METHODS),
  category: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional()
});

const applySchema = z.object({
  projectId: z.string().min(1),
  datasetId: z.string().min(1),
  outputName: z.string().optional(),
  outputFormat: z.enum(['csv', 'json', 'xlsx']).optional(),
  pythonVersion: z.enum(['3.10', '3.11']).optional(),
  features: z.array(featureSpecSchema).min(1)
});

export function createFeatureEngineeringRouter() {
  const router = Router();

  router.post('/feature-engineering/apply', async (req, res) => {
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.flatten()
      });
    }

    try {
      const result = await applyFeatureEngineering(parsed.data);
      const dataset = result.dataset;
      const tableName =
        typeof dataset.metadata?.tableName === 'string'
          ? dataset.metadata.tableName
          : sanitizeTableName(dataset.filename, dataset.datasetId);

      return res.status(201).json({
        dataset: {
          datasetId: dataset.datasetId,
          projectId: dataset.projectId,
          filename: dataset.filename,
          fileType: dataset.fileType,
          size: dataset.size,
          n_rows: dataset.nRows,
          n_cols: dataset.nCols,
          columns: dataset.columns.map((column) => column.name),
          dtypes: Object.fromEntries(dataset.columns.map((column) => [column.name, column.dtype])),
          null_counts: Object.fromEntries(dataset.columns.map((column) => [column.name, column.nullCount])),
          sample: dataset.sample,
          createdAt: dataset.createdAt,
          tableName
        }
      });
    } catch (error) {
      console.error('[feature-engineering] Apply failed:', error);
      const message = error instanceof Error ? error.message : 'Feature engineering failed';
      return res.status(400).json({ error: message });
    }
  });

  return router;
}
