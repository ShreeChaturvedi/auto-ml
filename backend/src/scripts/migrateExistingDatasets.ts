/**
 * Migration Script: Create Postgres tables for existing datasets
 *
 * This script creates tables for datasets that were uploaded before
 * the automatic table creation feature was implemented.
 *
 * Run with: npx tsx src/scripts/migrateExistingDatasets.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { rebuildDatasetTableFromSource } from '../services/datasetTableManager.js';

async function migrateExistingDatasets() {
  appLogger.info('[migration] Starting dataset migration');

  const repository = createDatasetRepository(env.datasetMetadataPath);
  const datasets = await repository.list();

  appLogger.info(`[migration] Found ${datasets.length} datasets`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const dataset of datasets) {
    try {
      const datasetDir = join(env.datasetStorageDir, dataset.datasetId);
      const filePath = join(datasetDir, dataset.filename);

      if (!existsSync(filePath)) {
        appLogger.info(`[migration] Skipped (file not found): ${dataset.filename}`);
        skipped++;
        continue;
      }

      readFileSync(filePath);
      const rebuiltDataset = await rebuildDatasetTableFromSource(dataset, repository);
      const tableName =
        typeof rebuiltDataset.metadata?.tableName === 'string'
          ? rebuiltDataset.metadata.tableName
          : dataset.filename;
      const rowsLoaded = rebuiltDataset.nRows;

      appLogger.info(`[migration] Created table "${tableName}" (${rowsLoaded} rows)`);
      migrated++;

    } catch (error) {
      appLogger.error(`[migration] Failed: ${dataset.filename}:`, error instanceof Error ? error.message : String(error));
      errors++;
    }
  }

  appLogger.info(`[migration] Complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
  process.exit(errors > 0 ? 1 : 0);
}

migrateExistingDatasets().catch((error) => {
  appLogger.error('[migration] Fatal error:', error);
  process.exit(1);
});
