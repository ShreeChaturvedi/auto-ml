import { hasDatabaseConfiguration } from '../../db.js';

import { FileProjectRepository } from './fileBackend.js';
import { InMemoryProjectRepository } from './inMemory.js';
import { PgProjectRepository } from './postgres.js';
import type { ProjectRepository } from './types.js';

export function createProjectRepository(storagePath: string): ProjectRepository {
  // Use Postgres when available to maintain foreign key integrity with datasets
  if (hasDatabaseConfiguration()) {
    try {
      console.log('[projectRepository] Using Postgres backend');
      return new PgProjectRepository();
    } catch (error) {
      console.error('[projectRepository] Postgres failed, falling back to file storage', error);
    }
  }

  // Fallback to file-based storage
  try {
    console.log('[projectRepository] Using file-based storage');
    return new FileProjectRepository(storagePath);
  } catch (error) {
    console.error('[projectRepository] Falling back to in-memory storage', error);
    return new InMemoryProjectRepository();
  }
}

// Re-export everything for backward compatibility
export type { ProjectRepository } from './types.js';
export { PHASE_VALUES, sanitizeMetadata, isValidPhase } from './types.js';
export { InMemoryProjectRepository } from './inMemory.js';
export { FileProjectRepository } from './fileBackend.js';
export { PgProjectRepository } from './postgres.js';
