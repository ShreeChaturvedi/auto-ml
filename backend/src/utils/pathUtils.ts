import { join } from 'node:path';

import { env } from '../config.js';

/**
 * Path construction utilities for consistent file organization
 * Consolidates repeated path patterns across the codebase
 */

export function getDatasetPath(datasetId: string, ...segments: string[]): string {
  return join(env.datasetStorageDir, datasetId, ...segments);
}

export function getModelPath(modelId: string, ...segments: string[]): string {
  return join(env.modelStorageDir, modelId, ...segments);
}

export function getProjectWorkspacePath(projectId: string, ...segments: string[]): string {
  return join(env.executionWorkspaceDir, projectId, ...segments);
}

export function getDocumentStoragePath(...segments: string[]): string {
  return join(env.documentStorageDir, ...segments);
}
