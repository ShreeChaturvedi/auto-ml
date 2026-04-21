/**
 * DataViewerNotebookPanel - Hosts a standalone notebook inside the data
 * viewer tab bar. Mounts the existing NotebookToolbar + NotebookEditor in
 * 'explorer' variant so the toolbar exposes Run All / Stop / Clear Outputs.
 */

import { useEffect } from 'react';
import { useNotebookStore } from '@/stores/notebookStore';
import { NotebookEditor } from '@/components/notebook/NotebookEditor';
import { NotebookToolbar } from '@/components/notebook/NotebookToolbar';

interface DataViewerNotebookPanelProps {
  projectId: string;
  notebookId: string;
}

export function DataViewerNotebookPanel({ projectId, notebookId }: DataViewerNotebookPanelProps) {
  const initializeNotebook = useNotebookStore((s) => s.initializeNotebook);

  useEffect(() => {
    void initializeNotebook(projectId, notebookId);
  }, [projectId, notebookId, initializeNotebook]);

  return (
    <div className="flex h-full flex-col">
      <NotebookToolbar projectId={projectId} variant="explorer" />
      <div className="flex-1 overflow-hidden">
        <NotebookEditor projectId={projectId} notebookId={notebookId} />
      </div>
    </div>
  );
}
