import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDbPool, getDbPool, hasDatabaseConfiguration } from '../db.js';
import { appLogger } from '../logging/logger.js';

async function runMigrations() {
  if (!hasDatabaseConfiguration()) {
    appLogger.error('[migrations] DATABASE_URL is not set. Cannot run migrations.');
    process.exitCode = 1;
    return;
  }

  const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    appLogger.warn('[migrations] No .sql files found in migrations directory.');
    return;
  }

  const pool = getDbPool();

  for (const file of migrationFiles) {
    const filePath = join(migrationsDir, file);
    const sql = readFileSync(filePath, 'utf8');

    appLogger.info(`[migrations] Running ${file}`);
    await pool.query(sql);
  }

  appLogger.info('[migrations] All migrations executed successfully');
}

runMigrations()
  .catch((error) => {
    appLogger.error('[migrations] Failed to run migrations', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbPool();
  });
