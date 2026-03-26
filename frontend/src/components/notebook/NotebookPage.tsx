/**
 * NotebookPage - Standalone notebook page accessible from EDA insight actions.
 *
 * Initializes the notebook store, renders the toolbar and editor.
 * Consumes pending insight context from the insightNavigationStore
 * (the actual consumption happens inside NotebookEditor).
 */

import { useEffect, useRef } from 'react';
import { NotebookToolbar } from './NotebookToolbar';
import { NotebookEditor, type NotebookEditorHandle } from './NotebookEditor';
import { useNotebookStore } from '@/stores/notebookStore';
import { useNotebookHeadings } from '@/hooks/useNotebookHeadings';

interface NotebookPageProps {
  projectId: string;
}

export function NotebookPage({ projectId }: NotebookPageProps) {
  const editorRef = useRef<NotebookEditorHandle>(null);
  const initializeNotebook = useNotebookStore((s) => s.initializeNotebook);
  const disconnect = useNotebookStore((s) => s.disconnect);

  useEffect(() => {
    void initializeNotebook(projectId);
    return () => disconnect();
  }, [projectId, initializeNotebook, disconnect]);

  const notebookHeadings = useNotebookHeadings();

  return (
    <div className="flex h-full flex-col">
      <NotebookToolbar
        projectId={projectId}
        headings={notebookHeadings}
        onScrollToHeading={(slug) => editorRef.current?.scrollToHeading(slug)}
      />
      <NotebookEditor ref={editorRef} projectId={projectId} className="min-h-0 flex-1" />
    </div>
  );
}
