// Barrel re-export — all logic has moved to ./project/
export type { ProjectRepository } from './project/index.js';
export {
  PHASE_VALUES,
  sanitizeMetadata,
  isValidPhase,
  createProjectRepository,
  getProjectRepository,
  InMemoryProjectRepository,
  FileProjectRepository,
  PgProjectRepository
} from './project/index.js';
