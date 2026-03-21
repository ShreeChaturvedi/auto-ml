import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Router } from 'express';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import type { DatasetRepository } from '../repositories/datasetRepository.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { loadDatasetIntoPostgres, sanitizeTableName } from '../services/datasetLoader.js';
import { regenerateNaturalLanguageSuggestions } from '../services/nlSuggestions/index.js';

import { updateColumnType } from './datasets/columnHandler.js';
import { getDatasetRows } from './datasets/rowHandler.js';
import { handleDatasetUpload, processDatasetUpload } from './datasets/uploadHandler.js';

export function createDatasetUploadRouter(repository?: DatasetRepository) {
  const router = Router();
  const datasetRepository = repository ?? createDatasetRepository(env.datasetMetadataPath);

  // ── List datasets ──────────────────────────────────────────────────
  router.get(
    '/datasets',
    asyncHandler(async (req, res) => {
      const projectId = req.query.projectId as string | undefined;
      let datasets = await datasetRepository.list();

      if (projectId) {
        datasets = datasets.filter((d) => d.projectId === projectId);
      }

      const withTableNames = datasets.map((dataset) => ({
        ...dataset,
        tableName:
          typeof dataset.metadata?.tableName === 'string'
            ? dataset.metadata.tableName
            : sanitizeTableName(dataset.filename, dataset.datasetId)
      }));

      res.json({ datasets: withTableNames });
    })
  );

  // ── Get dataset sample ─────────────────────────────────────────────
  router.get(
    '/datasets/:datasetId/sample',
    asyncHandler(async (req, res) => {
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
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
    asyncHandler(async (req, res) => {
      await getDatasetRows(req, res, datasetRepository);
    })
  );

  // ── Update column type ─────────────────────────────────────────────
  router.put(
    '/datasets/:datasetId/columns/:columnName',
    asyncHandler(async (req, res) => {
      await updateColumnType(req, res, datasetRepository);
    })
  );

  // ── Download dataset file ──────────────────────────────────────────
  router.get(
    '/datasets/:datasetId/download',
    asyncHandler(async (req, res) => {
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      const datasetDir = join(env.datasetStorageDir, datasetId);
      const filePath = join(datasetDir, dataset.filename);

      if (!existsSync(filePath)) {
        res.status(404).json({ error: 'Dataset file not found on disk' });
        return;
      }

      const buffer = readFileSync(filePath);

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
    asyncHandler(async (req, res) => {
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

          if (!existsSync(filePath)) {
            results.skipped.push(dataset.datasetId);
            continue;
          }

          const buffer = readFileSync(filePath);
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
            error instanceof Error ? error.message : String(error)
          );
          results.errors.push({
            datasetId: dataset.datasetId,
            error: error instanceof Error ? error.message : String(error)
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
    asyncHandler(async (req, res) => {
      const { datasetId } = req.params;
      const dataset = await datasetRepository.getById(datasetId);
      if (!dataset) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      const deleted = await datasetRepository.delete(datasetId);
      if (!deleted) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      // Delete physical files
      const datasetDir = join(env.datasetStorageDir, datasetId);
      if (existsSync(datasetDir)) {
        rmSync(datasetDir, { recursive: true, force: true });
      }

      // Drop Postgres table if it exists
      if (hasDatabaseConfiguration()) {
        try {
          const pool = getDbPool();
          const tableName =
            typeof dataset.metadata?.tableName === 'string'
              ? dataset.metadata.tableName
              : sanitizeTableName(dataset.filename, dataset.datasetId);

          await pool.query(`DROP TABLE IF EXISTS "${tableName}"`);
        } catch (error) {
          appLogger.error(
            `[datasets] Failed to drop table:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      appLogger.info(`[datasets] Deleted ${datasetId}`);

      if (dataset.projectId) {
        try {
          await regenerateNaturalLanguageSuggestions({ projectId: dataset.projectId });
        } catch (error) {
          appLogger.error(
            `[datasets] NL placeholder regeneration failed after delete for project ${dataset.projectId}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      res.json({ success: true });
    })
  );

  return router;
}
