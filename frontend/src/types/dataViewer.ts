/**
 * Typed tab records for the data viewer — replaces the old string[] model
 * that conflated file IDs with notebook IDs and artifact IDs.
 */
export type TabType = 'file' | 'artifact' | 'notebook';

export interface OpenTab {
  /** References UploadedFile.id, QueryArtifact.id, or Notebook.notebookId depending on type. */
  id: string;
  type: TabType;
}
