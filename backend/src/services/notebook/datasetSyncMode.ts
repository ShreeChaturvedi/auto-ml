import { asRecord, asString } from '../../utils/typeCoercion.js';

export type DatasetSyncMode = 'continue' | 'restart_from_original';

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

