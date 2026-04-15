import type { ColumnDataType, QueryArtifact, UploadedFile } from '@/types/file';
import type { OpenTab, TabType } from '@/types/dataViewer';
import type { Notebook } from '@/types/notebook';

/**
 * The effective "active tab" type stored in the data store. In addition to
 * the three real tab types, the store also permits the transient `'plan'`
 * marker for the query-plan panel, so we accept it here for symmetry with
 * `DataState.fileTabType`.
 */
export type ActiveTabType = TabType | 'plan';

export interface ResolveDataViewerSelectionInput {
  /** All typed open-tab records (not yet filtered by project). */
  openTabs: OpenTab[];
  /** Files scoped to the current project. */
  files: Pick<UploadedFile, 'id'>[];
  /** Query artifacts scoped to the current project. */
  queryArtifacts: Pick<QueryArtifact, 'id'>[];
  /** Standalone notebooks scoped to the current project. */
  standaloneNotebooks: Pick<Notebook, 'notebookId'>[];
  /** Whether the standalone notebook list for this project has been loaded. */
  notebooksHydrated?: boolean;
  /** The most-recently-active tab id (from zustand persist rehydration). */
  persistedActiveId: string | null;
  /** The most-recently-active tab type (from zustand persist rehydration). */
  persistedActiveType: ActiveTabType | null;
  /** First data-type file in the project, used for auto-open fallback. */
  firstDataFileId?: string | null;
}

export type DataViewerSelection =
  /** Active selection is still valid; do nothing. */
  | { kind: 'keep-active' }
  /** Activate an already-open tab (file/artifact/notebook). */
  | { kind: 'activate'; id: string; type: TabType }
  /** No tab is open yet for this file — open and activate it. */
  | { kind: 'open-file'; id: string }
  /** Nothing is available; clear any stale selection. */
  | { kind: 'none' };

function persistedTargetIsValid(
  id: string,
  type: ActiveTabType,
  input: ResolveDataViewerSelectionInput
): boolean {
  switch (type) {
    case 'file':
      return input.files.some((f) => f.id === id);
    case 'artifact':
      return input.queryArtifacts.some((a) => a.id === id);
    case 'notebook':
      if (
        input.notebooksHydrated === false
        && input.openTabs.some((tab) => tab.type === 'notebook' && tab.id === id)
      ) {
        return true;
      }
      return input.standaloneNotebooks.some((n) => n.notebookId === id);
    case 'plan':
      // Plan panels are ephemeral and don't map to a persistent entity; treat
      // as valid so we don't clobber an in-flight query-plan view on reload.
      return true;
    default:
      return false;
  }
}

/**
 * Decide what the data viewer's active tab should be on mount / when the
 * store changes. Honors a persisted active tab if its referenced entity
 * still exists, otherwise falls back in priority order: file → artifact →
 * notebook → auto-open first data file.
 */
export function resolveDataViewerSelection(
  input: ResolveDataViewerSelectionInput
): DataViewerSelection {
  const { openTabs, files, queryArtifacts, standaloneNotebooks, persistedActiveId, persistedActiveType, firstDataFileId } = input;

  // 1. Preserve a valid persisted selection across reloads.
  if (persistedActiveId && persistedActiveType && persistedTargetIsValid(persistedActiveId, persistedActiveType, input)) {
    return { kind: 'keep-active' };
  }

  // 2. Otherwise, pick the first available already-open tab for this
  //    project in priority order: file → artifact → notebook.
  const projectFileIds = new Set(files.map((f) => f.id));
  const projectArtifactIds = new Set(queryArtifacts.map((a) => a.id));
  const projectNotebookIds = new Set(standaloneNotebooks.map((n) => n.notebookId));

  const firstOpenFile = openTabs.find((t) => t.type === 'file' && projectFileIds.has(t.id));
  if (firstOpenFile) {
    return { kind: 'activate', id: firstOpenFile.id, type: 'file' };
  }

  const firstOpenArtifact = openTabs.find((t) => t.type === 'artifact' && projectArtifactIds.has(t.id));
  if (firstOpenArtifact) {
    return { kind: 'activate', id: firstOpenArtifact.id, type: 'artifact' };
  }

  const firstOpenNotebook = openTabs.find((t) => t.type === 'notebook' && projectNotebookIds.has(t.id));
  if (firstOpenNotebook) {
    return { kind: 'activate', id: firstOpenNotebook.id, type: 'notebook' };
  }

  // 3. Nothing open yet — fall back to the first data artifact or auto-open
  //    a data file from the project (legacy behavior preserved).
  const firstArtifact = queryArtifacts[0];
  if (firstArtifact) {
    return { kind: 'activate', id: firstArtifact.id, type: 'artifact' };
  }

  const firstNotebook = standaloneNotebooks[0];
  if (firstNotebook) {
    return { kind: 'activate', id: firstNotebook.notebookId, type: 'notebook' };
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
