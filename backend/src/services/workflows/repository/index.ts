import { hasDatabaseConfiguration } from '../../../db.js';

import { InMemoryWorkflowRepository } from './inMemory.js';
import { PostgresWorkflowRepository } from './postgres.js';
import type { WorkflowRepository } from './types.js';

const postgresRepository = new PostgresWorkflowRepository();
const inMemoryRepository = new InMemoryWorkflowRepository();

export function getWorkflowRepository(): WorkflowRepository {
  return hasDatabaseConfiguration() ? postgresRepository : inMemoryRepository;
}
