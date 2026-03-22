import { env } from '../../config.js';
import { hasDatabaseConfiguration } from '../../db.js';
import { appLogger } from '../../logging/logger.js';

import { FileProjectRepository } from './fileBackend.js';
import { InMemoryProjectRepository } from './inMemory.js';
import { PgProjectRepository } from './postgres.js';
import type { ProjectRepository } from './types.js';

export function createProjectRepository(storagePath: string): ProjectRepository {
  // Use Postgres when available to maintain foreign key integrity with datasets
  if (hasDatabaseConfiguration()) {
    try {
      appLogger.info('[projectRepository] Using Postgres backend');
      return new PgProjectRepository();
    } catch (error) {
      appLogger.error('[projectRepository] Postgres failed, falling back to file storage', error);
    }
  }

  // Fallback to file-based storage
  try {
    appLogger.info('[projectRepository] Using file-based storage');
    return new FileProjectRepository(storagePath);
  } catch (error) {
    appLogger.error('[projectRepository] Falling back to in-memory storage', error);
    return new InMemoryProjectRepository();
  }
}

let _sharedInstance: ProjectRepository | undefined;

/**
 * Returns a shared singleton ProjectRepository instance.
 * Uses env.storagePath from config for file-backed fallback.
 */
export function getProjectRepository(): ProjectRepository {
  if (!_sharedInstance) {
    _sharedInstance = createProjectRepository(env.storagePath);
  }
  return _sharedInstance;
}

// Re-export everything for backward compatibility
export type { ProjectRepository } from './types.js';
export { PHASE_VALUES, sanitizeMetadata, isValidPhase } from './types.js';
export { InMemoryProjectRepository } from './inMemory.js';
export { FileProjectRepository } from './fileBackend.js';
export { PgProjectRepository } from './postgres.js';
