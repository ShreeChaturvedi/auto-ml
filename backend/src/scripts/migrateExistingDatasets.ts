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
import { createDatasetRepository } from '../repositories/datasetRepository.js';
import { loadDatasetIntoPostgres } from '../services/datasetLoader.js';

async function migrateExistingDatasets() {
  console.log('[migration] Starting dataset migration');

  const repository = createDatasetRepository(env.datasetMetadataPath);
  const datasets = await repository.list();

  console.log(`[migration] Found ${datasets.length} datasets`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const dataset of datasets) {
    try {
      const datasetDir = join(env.datasetStorageDir, dataset.datasetId);
      const filePath = join(datasetDir, dataset.filename);

      if (!existsSync(filePath)) {
        console.log(`[migration] Skipped (file not found): ${dataset.filename}`);
        skipped++;
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

      await repository.update(dataset.datasetId, (current) => ({
        ...current,
        nRows: rowsLoaded,
        metadata: {
          ...(current.metadata ?? {}),
          tableName,
          rowsLoaded
        }
      }));

      console.log(`[migration] Created table "${tableName}" (${rowsLoaded} rows)`);
      migrated++;

    } catch (error) {
      console.error(`[migration] Failed: ${dataset.filename}:`, error instanceof Error ? error.message : String(error));
      errors++;
    }
  }

  console.log(`[migration] Complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
  process.exit(errors > 0 ? 1 : 0);
}

migrateExistingDatasets().catch((error) => {
  console.error('[migration] Fatal error:', error);
  process.exit(1);
});
