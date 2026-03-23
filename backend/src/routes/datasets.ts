import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Router } from 'express';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { verifyProjectOwnership } from '../middleware/resourceOwnership.js';
import type { DatasetRepository } from '../repositories/datasetRepository.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { loadDatasetIntoPostgres, resolveDatasetTableName } from '../services/datasetLoader.js';
import type { AuthRequest } from '../types/auth.js';
import { getErrorMessage } from '../utils/errors.js';

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
        ? await datasetRepository.listByProject(projectId)
        : await datasetRepository.list();

      const withTableNames = datasets.map((dataset) => ({
        ...dataset,
        tableName: resolveDatasetTableName(dataset)
      }));

      res.json({ datasets: withTableNames });
    })
  );

  // ── Get dataset sample ─────────────────────────────────────────────
  router.get(
    '/datasets/:datasetId/sample',
    asyncHandler(async (req: AuthRequest, res) => {
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'Dataset not found' });
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
    asyncHandler(async (req: AuthRequest, res) => {
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }
      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'Dataset not found' });
          return;
        }
      }
      await getDatasetRows(req, res, datasetRepository);
    })
  );

  // ── Update column type ─────────────────────────────────────────────
  router.put(
    '/datasets/:datasetId/columns/:columnName',
    asyncHandler(async (req: AuthRequest, res) => {
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }
      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'Dataset not found' });
          return;
        }
      }
      await updateColumnType(req, res, datasetRepository);
    })
  );

  // ── Download dataset file ──────────────────────────────────────────
  router.get(
    '/datasets/:datasetId/download',
    asyncHandler(async (req: AuthRequest, res) => {
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'Dataset not found' });
          return;
        }
      }

      const datasetDir = join(env.datasetStorageDir, datasetId);
      const filePath = join(datasetDir, dataset.filename);

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
      // Ownership check after multer parses multipart body
      const uploadProjectId = req.body?.projectId as string | undefined;
      if (req.user && uploadProjectId) {
        const project = await verifyProjectOwnership(uploadProjectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'Project not found' });
          return;
        }
      }
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
          const datasetDir = join(env.datasetStorageDir, dataset.datasetId);
          const filePath = join(datasetDir, dataset.filename);

          let buffer: Buffer;
          try {
            buffer = readFileSync(filePath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              results.skipped.push(dataset.datasetId);
              continue;
            }
            throw error;
          }
          const { tableName, rowsLoaded } = await loadDatasetIntoPostgres({
            datasetId: dataset.datasetId,
            filename: dataset.filename,
            fileType: dataset.fileType,
            buffer,
            columns: dataset.columns
          });

          appLogger.info(
            `[datasets] Migrated ${dataset.filename} -> "${tableName}" (${rowsLoaded} rows)`
          );
          await datasetRepository.update(dataset.datasetId, (current) => ({
            ...current,
            nRows: rowsLoaded,
            metadata: {
              ...(current.metadata ?? {}),
              tableName,
              rowsLoaded
            }
          }));
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
    asyncHandler(async (req: AuthRequest, res) => {
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      if (req.user && dataset.projectId) {
        const project = await verifyProjectOwnership(dataset.projectId, req.user.user_id, projectRepository);
        if (!project) {
          res.status(404).json({ error: 'Dataset not found' });
          return;
        }
      }

      const deleted = await datasetRepository.delete(datasetId);
      if (!deleted) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      // Delete physical files
      const datasetDir = join(env.datasetStorageDir, datasetId);
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
