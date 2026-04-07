import type { ModelRecord, ModelTaskType } from '@/types/model';

/** Primary metric per task type (higher = better). */
const PRIMARY_METRIC: Record<ModelTaskType, string> = {
  classification: 'accuracy',
  regression: 'r2',
  clustering: 'silhouette',
};

/**
 * Find the model ID with the highest primary metric score.
 * Optionally filters by task type (default: all task types).
 * Used by experiments (all types) and deployment (classification + regression only).
 */
export function findChampionModelId(
  models: ModelRecord[],
  taskTypeFilter?: ModelTaskType[],
): string | null {
  const eligible = models.filter(m => {
    if (m.status !== 'completed') return false;
    if (taskTypeFilter && !taskTypeFilter.includes(m.taskType)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  let champion: ModelRecord | null = null;
  let bestScore = -Infinity;

  for (const model of eligible) {
    const metric = PRIMARY_METRIC[model.taskType];
    const score = model.metrics[metric] ?? -Infinity;
    if (score > bestScore) {
      bestScore = score;
      champion = model;
    }
  }

  return champion?.modelId ?? null;
}
