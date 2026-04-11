import { access } from 'node:fs/promises';

import { Router, type Response } from 'express';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateUuidParams } from '../middleware/validateParams.js';
import type { DatasetRepository } from '../repositories/datasetRepository.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { resolveDatasetTableName } from '../services/datasetLoader.js';
import { ensureProjectDatasetSqlNames, resolveDatasetSqlName } from '../services/datasetSqlNames.js';
import { getDatasetQueryState, rebuildDatasetTableFromSource } from '../services/datasetTableManager.js';
import { getWorkflowRepository } from '../services/workflows/repository/index.js';
import * as notebookService from '../services/notebook/notebookService.js';
import type { AuthRequest } from '../types/auth.js';
import { getErrorMessage, sendNotFound } from '../utils/errors.js';
import { getDatasetPath } from '../utils/pathUtils.js';

import { updateColumnType } from './datasets/columnHandler.js';
import { regenerateProjectNlSuggestionsSilently } from './datasets/nlSuggestions.js';
import { getDatasetRows } from './datasets/rowHandler.js';
import {
  loadOwnedDataset,
  removeDatasetDirectory,
  renameDatasetFile,
  streamDatasetDownload,
} from './datasets/shared.js';
import { handleDatasetUpload, processDatasetUpload } from './datasets/uploadHandler.js';

async function hydrateDatasetsWithProjectSqlNames(datasetRepository: DatasetRepository) {
  const datasets = await datasetRepository.list();
  const projectIds = [...new Set(
    datasets
      .map((dataset) => dataset.projectId)
      .filter((value): value is string => Boolean(value))
  )];

  if (projectIds.length === 0) {
    return datasets;
  }

  const hydratedById = new Map(datasets.map((dataset) => [dataset.datasetId, dataset]));
  const projectDatasets = await Promise.all(
    projectIds.map((projectId) => ensureProjectDatasetSqlNames(projectId, datasetRepository))
  );

  for (const items of projectDatasets) {
    for (const dataset of items) {
      hydratedById.set(dataset.datasetId, dataset);
    }
  }

  return datasets.map((dataset) => hydratedById.get(dataset.datasetId) ?? dataset);
}

export function createDatasetUploadRouter(repository?: DatasetRepository) {
  const router = Router();
  const datasetRepository = repository ?? createDatasetRepository(env.datasetMetadataPath);
  const projectRepository = getProjectRepository();

  async function requireDataset(req: AuthRequest, res: Response, datasetId: string) {
    return loadOwnedDataset(req, res, datasetRepository, projectRepository, datasetId);
  }

  // ── List datasets ──────────────────────────────────────────────────
  router.get(
    '/datasets',
    asyncHandler(async (req, res) => {
      const projectId = req.query.projectId as string | undefined;
      const hydratedDatasets = projectId
        ? await ensureProjectDatasetSqlNames(projectId, datasetRepository)
        : await hydrateDatasetsWithProjectSqlNames(datasetRepository);

      const withTableNames = await Promise.all(hydratedDatasets.map(async (dataset) => {
        const queryState = await getDatasetQueryState(dataset);
        return {
          ...dataset,
          tableName: resolveDatasetSqlName(dataset),
          physicalTableName: queryState.tableName,
          queryable: queryState.queryable,
          queryError: queryState.queryError
        };
      }));

      res.json({ datasets: withTableNames });
    })
  );

  // ── Get dataset sample ─────────────────────────────────────────────
  router.get(
    '/datasets/:datasetId/sample',
    validateUuidParams('datasetId'),
    asyncHandler(async (req: AuthRequest, res) => {
      const dataset = await requireDataset(req, res, req.params.datasetId);
      if (!dataset) return;

      res.json({
        sample: dataset.sample,
        columns: dataset.columns.map((c) => c.name),
        rowCount: dataset.nRows
      });
    })
  );

  // ── Get paged dataset rows ─────────────────────────────────────────
  router.get(
    '/datasets/:datasetId/rows',
    validateUuidParams('datasetId'),
    asyncHandler(async (req: AuthRequest, res) => {
      const dataset = await requireDataset(req, res, req.params.datasetId);
      if (!dataset) return;
      await getDatasetRows(req, res, datasetRepository);
    })
  );

  // ── Update column type ─────────────────────────────────────────────
  router.put(
    '/datasets/:datasetId/columns/:columnName',
    validateUuidParams('datasetId'),
    asyncHandler(async (req: AuthRequest, res) => {
      const dataset = await requireDataset(req, res, req.params.datasetId);
      if (!dataset) return;
      await updateColumnType(req, res, datasetRepository);
    })
  );

  // ── Rename dataset ───────────────────────────────────────────────────
  router.patch(
    '/datasets/:datasetId',
    validateUuidParams('datasetId'),
    asyncHandler(async (req: AuthRequest, res) => {
      const { datasetId } = req.params;
      const { filename } = req.body as { filename?: string };

      if (!filename || typeof filename !== 'string' || !filename.trim()) {
        res.status(400).json({ error: 'filename is required' });
        return;
      }

      const dataset = await requireDataset(req, res, datasetId);
      if (!dataset) return;

      await renameDatasetFile(datasetId, dataset.filename, filename.trim());

      const updated = await datasetRepository.update(datasetId, (current) => ({
        ...current,
        filename: filename.trim()
      }));

      if (!updated) { sendNotFound(res, 'Dataset'); return; }
      res.json({ dataset: updated });
    })
  );

  // ── Download dataset file ──────────────────────────────────────────
  router.get(
    '/datasets/:datasetId/download',
    validateUuidParams('datasetId'),
    asyncHandler(async (req: AuthRequest, res) => {
      const { datasetId } = req.params;
      const dataset = await requireDataset(req, res, datasetId);
      if (!dataset) return;
      streamDatasetDownload(res, dataset);
    })
  );

  // ── Upload dataset ─────────────────────────────────────────────────
  router.post(
    '/upload/dataset',
    handleDatasetUpload,
    asyncHandler(async (req: AuthRequest, res) => {
      // Project ownership is verified by requireProjectAccess middleware
      await processDatasetUpload(req, res, datasetRepository);
    })
  );

  // ── Migrate datasets to Postgres ───────────────────────────────────
  router.post(
    '/datasets/migrate',
    asyncHandler(async (_req, res) => {
      if (!hasDatabaseConfiguration()) {
        res.status(503).json({ error: 'Database is not configured for migration' });
        return;
      }

      const datasets = await datasetRepository.list();

      const results = {
        migrated: [] as string[],
        skipped: [] as string[],
        errors: [] as { datasetId: string; error: string }[]
      };

      for (const dataset of datasets) {
        try {
          const filePath = getDatasetPath(dataset.datasetId, dataset.filename);

          try {
            await access(filePath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              results.skipped.push(dataset.datasetId);
              continue;
            }
            throw error;
          }

          const rebuiltDataset = await rebuildDatasetTableFromSource(dataset, datasetRepository);
          const tableName =
            typeof rebuiltDataset.metadata?.tableName === 'string'
              ? rebuiltDataset.metadata.tableName
              : dataset.filename;
          const rowsLoaded = rebuiltDataset.nRows;

          appLogger.info(
            `[datasets] Migrated ${dataset.filename} -> "${tableName}" (${rowsLoaded} rows)`
          );
          results.migrated.push(dataset.datasetId);
        } catch (error) {
          appLogger.error(
            `[datasets] Migration failed for ${dataset.filename}:`,
            getErrorMessage(error, String(error))
          );
          results.errors.push({
            datasetId: dataset.datasetId,
            error: getErrorMessage(error, String(error))
          });
        }
      }

      appLogger.info(
        `[datasets] Migration complete: ${results.migrated.length} migrated, ${results.skipped.length} skipped, ${results.errors.length} errors`
      );

      res.json({ success: true, results });
    })
  );

  // ── Delete dataset ─────────────────────────────────────────────────
  router.delete(
    '/datasets/:datasetId',
    validateUuidParams('datasetId'),
    asyncHandler(async (req: AuthRequest, res) => {
      const { datasetId } = req.params;
      const dataset = await requireDataset(req, res, datasetId);
      if (!dataset) return;

      // Pre-deletion guard: reject if active workflows reference this dataset
      const workflowRepo = getWorkflowRepository();
      const referencingRuns = await workflowRepo.findRunsByDataset(datasetId);
      const activeWorkflows = referencingRuns.filter(
        (r) => r.status === 'running' || r.status === 'paused'
      );

      const staleWorkflowIds = new Set<string>();
      for (const run of activeWorkflows) {
        if (!run.activeNotebookId) {
          continue;
        }
        const notebook = await notebookService.getNotebook(run.activeNotebookId);
        if (notebook) {
          continue;
        }
        staleWorkflowIds.add(run.runId);
        const interrupted = await workflowRepo.saveRun({
          ...run,
          status: 'interrupted',
          pendingInputKind: undefined,
          pauseReason: undefined,
          activeNotebookId: undefined,
          lastFailureCode: 'STALE_NOTEBOOK_REFERENCE',
          lastFailureMessage: 'Workflow auto-interrupted because its notebook no longer exists.'
        });
        await workflowRepo.appendEvent(interrupted.runId, 'workflow_interrupted', {
          reason: 'Workflow auto-interrupted because its notebook no longer exists.',
          code: 'STALE_NOTEBOOK_REFERENCE'
        });
      }

      const blockingWorkflows = activeWorkflows.filter((run) => !staleWorkflowIds.has(run.runId));
      if (blockingWorkflows.length > 0) {
        const activeWorkflowDetails = blockingWorkflows.map((run) => ({
          runId: run.runId,
          phase: run.phase,
          status: run.status,
          pendingInputKind: run.pendingInputKind ?? null,
          activeNotebookId: run.activeNotebookId ?? null,
          updatedAt: run.updatedAt
        }));
        res.status(409).json({
          error: 'DATASET_IN_USE',
          message: `Cannot delete dataset: referenced by ${blockingWorkflows.length} active workflow(s).`,
          datasetId,
          datasetFilename: dataset.filename,
          activeRunIds: blockingWorkflows.map((r) => r.runId),
          activeWorkflows: activeWorkflowDetails
        });
        return;
      }

      const deleted = await datasetRepository.delete(datasetId);
      if (!deleted) {
        sendNotFound(res, 'Dataset');
        return;
      }

      // Delete physical files
      await removeDatasetDirectory(datasetId);

      // Drop Postgres table if it exists
      if (hasDatabaseConfiguration()) {
        try {
          const pool = getDbPool();
          const tableName = resolveDatasetTableName(dataset);

          await pool.query(`DROP TABLE IF EXISTS "${tableName}"`);
        } catch (error) {
          appLogger.error(
            `[datasets] Failed to drop table:`,
            getErrorMessage(error, String(error))
          );
        }
      }

      appLogger.info(`[datasets] Deleted ${datasetId}`);

      await regenerateProjectNlSuggestionsSilently(dataset.projectId, 'delete');

      res.json({ success: true });
    })
  );

  return router;
}
