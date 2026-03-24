import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { SettingsRepository } from '../repositories/settingsRepository.js';

/**
 * Reads a user's runtime settings, falling back to env-var defaults.
 * When no userId is provided or DB is unavailable, returns env defaults.
 */
export async function getUserExecutionConfig(userId?: string) {
  const defaults = {
    queryCacheTtlMs: env.queryCacheTtlMs,
    sqlMaxRows: env.sqlMaxRows,
    sqlDefaultLimit: env.sqlDefaultLimit,
    executionTimeoutMs: env.executionTimeoutMs,
    executionMaxMemoryMb: env.executionMaxMemoryMb,
  };

  if (!userId || !hasDatabaseConfiguration()) return defaults;

  try {
    const repo = new SettingsRepository(getDbPool());
    const rows = await repo.getAll(userId);
    const overrides: Record<string, string> = {};
    for (const row of rows) overrides[row.setting_key] = row.value;

    return {
      queryCacheTtlMs: overrides.queryCacheTtlMs ? Number(overrides.queryCacheTtlMs) : defaults.queryCacheTtlMs,
      sqlMaxRows: overrides.sqlMaxRows ? Number(overrides.sqlMaxRows) : defaults.sqlMaxRows,
      sqlDefaultLimit: overrides.sqlDefaultLimit ? Number(overrides.sqlDefaultLimit) : defaults.sqlDefaultLimit,
      executionTimeoutMs: overrides.executionTimeoutMs ? Number(overrides.executionTimeoutMs) : defaults.executionTimeoutMs,
      executionMaxMemoryMb: overrides.executionMaxMemoryMb ? Number(overrides.executionMaxMemoryMb) : defaults.executionMaxMemoryMb,
    };
  } catch {
    return defaults;
  }
}
