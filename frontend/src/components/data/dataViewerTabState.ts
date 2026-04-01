import type { ColumnDataType, UploadedFile } from '@/types/file';

export type DataViewerSelection =
  | { kind: 'keep-active' }
  | { kind: 'activate'; id: string; type: 'file' | 'artifact' }
  | { kind: 'open-file'; id: string }
  | { kind: 'none' };

export function resolveDataViewerSelection({
  hasActiveFile,
  hasActiveArtifact,
  openFileTabsForProject,
  queryArtifactIds,
  firstDataFileId,
}: {
  hasActiveFile: boolean;
  hasActiveArtifact: boolean;
  openFileTabsForProject: string[];
  queryArtifactIds: string[];
  firstDataFileId: string | null;
}): DataViewerSelection {
  if (hasActiveFile || hasActiveArtifact) {
    return { kind: 'keep-active' };
  }

  const firstProjectFileTabId = openFileTabsForProject[0];
  if (firstProjectFileTabId) {
    return { kind: 'activate', id: firstProjectFileTabId, type: 'file' };
  }

  const firstArtifactId = queryArtifactIds[0];
  if (firstArtifactId) {
    return { kind: 'activate', id: firstArtifactId, type: 'artifact' };
  }

  if (firstDataFileId) {
    return { kind: 'open-file', id: firstDataFileId };
  }

  return { kind: 'none' };
}

export function buildDatasetSchema(files: Array<Pick<UploadedFile, 'metadata'>>) {
  const dtypes = files[0]?.metadata?.datasetProfile?.dtypes;
  if (!dtypes) {
    return undefined;
  }

  return Object.entries(dtypes).map(([column, dtype]) => ({
    column,
    dtype: dtype as ColumnDataType,
  }));
}
