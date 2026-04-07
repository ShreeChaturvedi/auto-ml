/**
 * Feature Engineering Routes
 *
 * Apply engineered features to datasets using the Python runtime.
 * Expose feature pipeline run state for frontend hydration.
 */

import { Router } from 'express';
import { z } from 'zod';

import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { resolveDatasetTableName } from '../services/datasetLoader.js';
import { resolveDatasetSqlName } from '../services/datasetSqlNames.js';
import { applyFeatureEngineering, FEATURE_METHODS } from '../services/featureEngineering.js';
import { featureRunRepository } from '../services/workflows/phases/featureEngineering.js';
import { getErrorMessage } from '../utils/errors.js';

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
  enabled: z.boolean().optional(),
  // LLM-authored Python code. Capped at 50KB per feature (typical
  // real-world LLM code is 1-4KB; this gives 10x+ headroom and keeps
  // a 50-feature apply payload under ~2.5MB, well below Express's 10MB body limit).
  code: z.string().max(50000).optional()
});

const applySchema = z.object({
  projectId: z.string().min(1),
  datasetId: z.string().min(1),
  outputName: z.string().optional(),
  outputFormat: z.enum(['csv', 'json', 'xlsx']).optional(),
  pythonVersion: z.enum(['3.10', '3.11']).optional(),
  features: z.array(featureSpecSchema).min(1)
});

const featureRunQuerySchema = z.object({
  projectId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const featureRunParamsSchema = z.object({
  runId: z.string().min(1)
});

export function createFeatureEngineeringRouter() {
  const router = Router();

  router.post('/feature-engineering/apply', asyncHandler(async (req, res) => {
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
      const tableName = resolveDatasetTableName(dataset);

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
          tableName: resolveDatasetSqlName(dataset),
          physicalTableName: tableName,
          warning: result.warning
        },
        warning: result.warning
      });
    } catch (error) {
      appLogger.error('[feature-engineering] Apply failed:', error);
      return res.status(400).json({ error: getErrorMessage(error, 'Feature engineering failed') });
    }
  }));

  // ---- Run listing and snapshots ------------------------------------------

  router.get('/feature-engineering/runs', asyncHandler(async (req, res) => {
    const parsed = featureRunQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    try {
      let runs = await featureRunRepository.listByProjectId(parsed.data.projectId);
      if (parsed.data.limit) {
        runs = runs.slice(0, parsed.data.limit);
      }
      return res.json({
        projectId: parsed.data.projectId,
        count: runs.length,
        runs
      });
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error, 'Failed to list feature runs') });
    }
  }));

  router.get('/feature-engineering/runs/:runId', asyncHandler(async (req, res) => {
    const parsedParams = featureRunParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsedParams.error.issues });
    }

    try {
      const run = await featureRunRepository.getById(parsedParams.data.runId);
      if (!run) {
        return res.status(404).json({ error: 'Feature run not found' });
      }

      return res.json({ run });
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error, 'Failed to load feature run') });
    }
  }));

  return router;
}
