import { readFileSync, renameSync, rmSync } from 'node:fs';

import { Router } from 'express';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import { validateUuidParams } from '../middleware/validateParams.js';
import type { DatasetRepository } from '../repositories/datasetRepository.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { resolveDatasetTableName } from '../services/datasetLoader.js';
import { ensureProjectDatasetSqlNames, resolveDatasetSqlName } from '../services/datasetSqlNames.js';
import { getDatasetQueryState, rebuildDatasetTableFromSource } from '../services/datasetTableManager.js';
import { getWorkflowRepository } from '../services/workflows/repository/index.js';
import type { AuthRequest } from '../types/auth.js';
import { getErrorMessage, sendNotFound } from '../utils/errors.js';
import { getDatasetPath } from '../utils/pathUtils.js';

import { updateColumnType } from './datasets/columnHandler.js';
import { regenerateProjectNlSuggestionsSilently } from './datasets/nlSuggestions.js';
import { getDatasetRows } from './datasets/rowHandler.js';
import { handleDatasetUpload, processDatasetUpload } from './datasets/uploadHandler.js';

export function createDatasetUploadRouter(repository?: DatasetRepository) {
  const router = Router();
  const datasetRepository = repository ?? createDatasetRepository(env.datasetMetadataPath);
  const projectRepository = getProjectRepository();

  // ── List datasets ──────────────────────────────────────────────────
  router.get(
    '/datasets',
    asyncHandler(async (req, res) => {
      const projectId = req.query.projectId as string | undefined;
      const datasets = projectId
        ? await ensureProjectDatasetSqlNames(projectId, datasetRepository)
        : await datasetRepository.list();

      const hydratedDatasets = projectId
        ? datasets
        : await (async () => {
            const byId = new Map(datasets.map((dataset) => [dataset.datasetId, dataset]));
            const projectIds = [...new Set(
              datasets
                .map((dataset) => dataset.projectId)
                .filter((value): value is string => Boolean(value))
            )];

            const projects = await Promise.all(
              projectIds.map((currentProjectId) => ensureProjectDatasetSqlNames(currentProjectId, datasetRepository))
            );

            for (const projectDatasets of projects) {
              for (const dataset of projectDatasets) {
                byId.set(dataset.datasetId, dataset);
              }
            }

            return datasets.map((dataset) => byId.get(dataset.datasetId) ?? dataset);
          })();

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
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        sendNotFound(res, 'Dataset');
        return;
      }

      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          sendNotFound(res, 'Dataset');
          return;
        }
      }

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
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        sendNotFound(res, 'Dataset');
        return;
      }
      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          sendNotFound(res, 'Dataset');
          return;
        }
      }
      await getDatasetRows(req, res, datasetRepository);
    })
  );

  // ── Update column type ─────────────────────────────────────────────
  router.put(
    '/datasets/:datasetId/columns/:columnName',
    validateUuidParams('datasetId'),
    asyncHandler(async (req: AuthRequest, res) => {
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        sendNotFound(res, 'Dataset');
        return;
      }
      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          sendNotFound(res, 'Dataset');
          return;
        }
      }
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

      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) { sendNotFound(res, 'Dataset'); return; }

      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) { sendNotFound(res, 'Dataset'); return; }
      }

      // Rename physical file on disk
      const oldPath = getDatasetPath(datasetId, dataset.filename);
      const newPath = getDatasetPath(datasetId, filename.trim());
      try {
        renameSync(oldPath, newPath);
      } catch { /* file may not exist on disk for derived datasets */ }

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
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        sendNotFound(res, 'Dataset');
        return;
      }

      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          sendNotFound(res, 'Dataset');
          return;
        }
      }

      const filePath = getDatasetPath(datasetId, dataset.filename);

      let buffer: Buffer;
      try {
        buffer = readFileSync(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          res.status(404).json({ error: 'Dataset file not found on disk' });
          return;
        }
        throw error;
      }

      const contentTypes: Record<string, string> = {
        csv: 'text/csv',
        json: 'application/json',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      res.setHeader('Content-Type', contentTypes[dataset.fileType] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${dataset.filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
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
            readFileSync(filePath);
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
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        sendNotFound(res, 'Dataset');
        return;
      }

      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          sendNotFound(res, 'Dataset');
          return;
        }
      }

      // Pre-deletion guard: reject if active workflows reference this dataset
      const workflowRepo = getWorkflowRepository();
      const referencingRuns = await workflowRepo.findRunsByDataset(datasetId);
      const activeWorkflows = referencingRuns.filter(
        (r) => r.status === 'running' || r.status === 'paused'
      );
      if (activeWorkflows.length > 0) {
        res.status(409).json({
          error: 'DATASET_IN_USE',
          message: `Cannot delete dataset: referenced by ${activeWorkflows.length} active workflow(s).`,
          activeRunIds: activeWorkflows.map((r) => r.runId)
        });
        return;
      }

      const deleted = await datasetRepository.delete(datasetId);
      if (!deleted) {
        sendNotFound(res, 'Dataset');
        return;
      }

      // Delete physical files
      const datasetDir = getDatasetPath(datasetId);
      try {
        rmSync(datasetDir, { recursive: true, force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

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
