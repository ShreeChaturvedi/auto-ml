import { appLogger } from '../logging/logger.js';
import type { ModelRepository } from '../repositories/modelRepository.js';
import type { ModelRecord } from '../types/model.js';

/** Infer target column: explicit "target" column, else last column (standard ML convention). */
export function inferTargetColumn(columns: { name: string }[]): string {
  if (columns.length === 0) return 'target';
  const explicit = columns.find((c) => c.name.toLowerCase() === 'target');
  if (explicit) return explicit.name;
  return columns[columns.length - 1].name;
}

/**
 * Resolve a model's target column against the current dataset schema.
 * Returns the stored value when it still exists in the dataset, otherwise
 * falls back to `inferTargetColumn`.
 */
export function resolveTargetColumn(
  model: Pick<ModelRecord, 'targetColumn'>,
  datasetColumns: { name: string }[],
): string {
  if (model.targetColumn && datasetColumns.some((c) => c.name === model.targetColumn)) {
    return model.targetColumn;
  }
  return inferTargetColumn(datasetColumns);
}

/**
 * Resolve and, if necessary, persist a corrected target column on the model record.
 * This "heals" stale metadata left over after a dataset schema change.
 */
export async function resolveAndHealTargetColumn(
  model: Pick<ModelRecord, 'modelId' | 'targetColumn'>,
  datasetColumns: { name: string }[],
  repo: Pick<ModelRepository, 'update'>,
): Promise<string> {
  const resolved = resolveTargetColumn(model, datasetColumns);

  if (resolved !== model.targetColumn) {
    appLogger.warn(
      `[modelUtils] Healing stale targetColumn on model ${model.modelId}: ` +
        `"${model.targetColumn ?? '(undefined)'}" → "${resolved}"`,
    );
    await repo.update(model.modelId, (current) => ({ ...current, targetColumn: resolved }));
  }

  return resolved;
}
