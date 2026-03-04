export type DatasetSyncMode = 'continue' | 'restart_from_original';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseDatasetSyncMode(
  metadata: unknown
): DatasetSyncMode | undefined {
  const cellMetadata = asRecord(metadata);
  const preprocessing = asRecord(cellMetadata?.preprocessing);
  const mode = asString(preprocessing?.datasetContinuityMode);
  if (mode === 'continue' || mode === 'restart_from_original') {
    return mode;
  }
  return undefined;
}

export function resolveDatasetSyncMode(
  optionsMode?: DatasetSyncMode,
  cellMetadata?: unknown
): DatasetSyncMode {
  if (optionsMode) {
    return optionsMode;
  }
  return parseDatasetSyncMode(cellMetadata) ?? 'continue';
}

export function shouldOverwriteDatasetWorkspace(mode: DatasetSyncMode): boolean {
  return mode === 'restart_from_original';
}

