import { randomUUID } from 'crypto';

import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { resolveDatasetTableName } from '../services/datasetLoader.js';
import {
  executePreprocessingTool,
  getPreprocessingRunSnapshot,
  isPreprocessingToolName,
  listPreprocessingRunSnapshots,
  syncPreprocessingLangGraphState
} from '../services/llm/preprocessingGraph.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

const compatibilityCheckSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1),
  checkpointId: z.string().min(1),
  replayDatasetId: z.string().min(1)
});

const stepDecisionSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1),
  stepId: z.string().min(1),
  approved: z.boolean(),
  rejectionReason: z.string().optional(),
  datasetId: z.string().optional()
});

const preprocessingRunQuerySchema = z.object({
  projectId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const preprocessingRunParamsSchema = z.object({
  runId: z.string().min(1)
});

export function createPreprocessingRouter() {
  const router = Router();

  // ---- Tables listing ----

  router.get('/preprocessing/tables', asyncHandler(async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      let datasets = await datasetRepository.list();
      if (projectId) {
        datasets = datasets.filter((dataset) => dataset.projectId === projectId);
      }

      const tables = datasets.map((dataset) => ({
        datasetId: dataset.datasetId,
        name: resolveDatasetTableName(dataset),
        filename: dataset.filename,
        sizeBytes: dataset.size,
        nRows: dataset.nRows,
        nCols: dataset.nCols,
        columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
        previewRows: dataset.sample?.slice(0, 5) ?? []
      }));

      return res.json({ tables });
    } catch (error) {
      appLogger.error('[preprocessing] Failed to list tables:', error);
      return res.status(500).json({ error: 'Failed to list tables' });
    }
  }));

  // ---- Step approval / rejection ----

  router.post('/preprocessing/step-decision', asyncHandler(async (req, res) => {
    const parsed = stepDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    const { projectId, runId, stepId, approved, rejectionReason, datasetId } = parsed.data;

    try {
      const toolArgs: Record<string, unknown> = {
        runId,
        stepId,
        approved,
        approvalSource: 'user',
        toolCallId: `${approved ? 'approve' : 'reject'}-${stepId}-${randomUUID()}`,
        ...(approved && datasetId ? { datasetId } : {}),
        ...(!approved && rejectionReason ? { rejectionReason } : {})
      };

      const rawResult = await executePreprocessingTool(projectId, 'commit_transformation_step', toolArgs);
      const result = await syncPreprocessingLangGraphState(
        projectId, 'commit_transformation_step', toolArgs, rawResult
      );

      return res.json({
        id: toolArgs.toolCallId,
        tool: 'commit_transformation_step',
        output: result.output,
        error: result.error
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Step decision failed';
      return res.status(500).json({ error: message });
    }
  }));

  // ---- Replay compatibility check ----

  router.post('/preprocessing/check-compatibility', asyncHandler(async (req, res) => {
    const parsed = compatibilityCheckSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    const { projectId, runId, checkpointId, replayDatasetId } = parsed.data;
    const toolName = 'restore_checkpoint';

    if (!isPreprocessingToolName(toolName)) {
      return res.status(500).json({ error: 'Tool not available' });
    }

    try {
      const toolArgs = {
        runId,
        checkpointId,
        operation: 'compatibility_check',
        replayDatasetId,
        toolCallId: `compat-check-${randomUUID()}`
      };

      const rawResult = await executePreprocessingTool(projectId, toolName, toolArgs);
      const result = await syncPreprocessingLangGraphState(projectId, toolName, toolArgs, rawResult);

      return res.json({
        output: result.output,
        error: result.error
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Compatibility check failed';
      return res.status(500).json({ error: message });
    }
  }));

  // ---- Run listing and snapshots (migrated from preprocessingHandler) ----

  router.get('/preprocessing/runs', asyncHandler(async (req, res) => {
    const parsed = preprocessingRunQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    try {
      const runs = await listPreprocessingRunSnapshots(parsed.data.projectId, parsed.data.limit);
      return res.json({
        projectId: parsed.data.projectId,
        count: runs.length,
        runs
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list preprocessing runs';
      return res.status(500).json({ error: message });
    }
  }));

  router.get('/preprocessing/runs/:runId', asyncHandler(async (req, res) => {
    const parsedParams = preprocessingRunParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsedParams.error.issues });
    }

    const parsedQuery = preprocessingRunQuerySchema.pick({ projectId: true }).partial().safeParse(req.query);
    const projectIdQuery = parsedQuery.success ? parsedQuery.data.projectId : undefined;

    try {
      const run = await getPreprocessingRunSnapshot(parsedParams.data.runId);
      if (!run) {
        return res.status(404).json({ error: 'Preprocessing run not found' });
      }

      if (projectIdQuery && run.projectId !== projectIdQuery) {
        return res.status(404).json({ error: 'Preprocessing run not found' });
      }

      return res.json({ run });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load preprocessing run';
      return res.status(500).json({ error: message });
    }
  }));

  return router;
}
