/**
 * Experiment insights and reporting service
 * Handles model summaries, cache key generation, and evaluation loading
 */

import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { env } from '../config.js';
import { loadModelFile } from '../utils/modelFileLoader.js';

import { extractEvalSummary } from './llm/prompts/experimentReport.js';

export interface ModelSummary {
  modelId: string;
  name: string;
  algorithm: string;
  taskType: string;
  status: string;
  metrics: Record<string, number>;
}

/**
 * Build model summaries from model list (for report generation and caching)
 * @param models - Models with their metadata
 * @returns Sorted array of model summaries with key fields
 */
export function buildModelSummaries(models: Array<{
  modelId: string;
  name: string;
  algorithm: string;
  taskType: string;
  status: string;
  metrics: Record<string, number>;
}>): ModelSummary[] {
  return models
    .map(m => ({
      modelId: m.modelId,
      name: m.name,
      algorithm: m.algorithm,
      taskType: m.taskType,
      status: m.status,
      metrics: m.metrics,
    }))
    .sort((a, b) => a.modelId.localeCompare(b.modelId));
}

/**
 * Compute cache key hash for model state
 * @param projectId - Project identifier
 * @param modelSummaries - Sorted model summaries
 * @returns SHA256 hash of project + model state
 */
export function computeModelHash(projectId: string, modelSummaries: ModelSummary[]): string {
  return createHash('sha256')
    .update(projectId + JSON.stringify(modelSummaries))
    .digest('hex');
}

/**
 * Load evaluation summaries for all models in parallel
 * @param models - Models to load evaluations for
 * @returns Map of modelId to evaluation summary
 */
export async function loadEvaluationSummaries(
  models: ModelSummary[],
): Promise<Record<string, ReturnType<typeof extractEvalSummary>>> {
  const evaluations: Record<string, ReturnType<typeof extractEvalSummary>> = {};

  await Promise.all(
    models.map(async (m) => {
      const data = await loadModelFile(join(env.modelStorageDir, m.modelId, 'evaluation.json'));
      if (data) {
        evaluations[m.modelId] = extractEvalSummary(data as Record<string, unknown>);
      }
    }),
  );

  return evaluations;
}
