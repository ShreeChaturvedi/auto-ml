/**
 * useFileActions — shared hook for file operations (open, delete, download)
 * and data/context file partitioning. Used by both FileSubtabs (sidebar) and FileExplorer (panel).
 */

import { useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { phaseConfig } from '@/types/phase';
import { deleteDataset } from '@/lib/api/datasets';
import { deleteDocument } from '@/lib/api/documents';
import { ApiError } from '@/lib/api/client';
import { DATA_FILE_TYPES, downloadFile } from '@/lib/fileUtils';
import type { UploadedFile } from '@/types/file';

export interface UseFileActionsReturn {
  projectFiles: UploadedFile[];
  dataFiles: UploadedFile[];
  contextFiles: UploadedFile[];
  activeFileTabId: string | null;
  isOnDataViewer: boolean;
  handleOpenFile: (fileId: string) => void;
  handleDeleteFile: (file: UploadedFile) => Promise<void>;
  handleDownloadFile: (file: UploadedFile) => Promise<void>;
}

export function useFileActions(projectId: string): UseFileActionsReturn {
  const navigate = useNavigate();
  const location = useLocation();

  const files = useDataStore((s) => s.files);
  const activeFileTabId = useDataStore((s) => s.activeFileTabId);
  const openFileTab = useDataStore((s) => s.openFileTab);
  const removeFile = useDataStore((s) => s.removeFile);

  const isDataViewerUnlocked = useProjectStore((s) =>
    s.isPhaseUnlocked(projectId, 'data-viewer')
  );
  const currentPhase = useProjectStore(
    (s) => s.projects.find((p) => p.id === projectId)?.currentPhase
  );
  const currentPhaseLabel = currentPhase
    ? (phaseConfig[currentPhase]?.label ?? 'the current step')
    : 'the current step';

  const projectFiles = useMemo(
    () => files.filter((f) => f.projectId === projectId),
    [files, projectId]
  );
  const dataFiles = useMemo(
    () => projectFiles.filter((f) => DATA_FILE_TYPES.has(f.type)),
    [projectFiles]
  );
  const contextFiles = useMemo(
    () => projectFiles.filter((f) => !DATA_FILE_TYPES.has(f.type)),
    [projectFiles]
  );

  const isOnDataViewer = location.pathname.endsWith('/data-viewer');

  const handleOpenFile = useCallback(
    (fileId: string) => {
      if (!isDataViewerUnlocked) {
        const description =
          currentPhase === 'upload'
            ? 'Finish the Data Upload workflow to unlock Explorer.'
            : `Complete ${currentPhaseLabel} to unlock Explorer.`;
        toast.info('Explorer is still locked', { description });
        return;
      }
      openFileTab(fileId);
      navigate(`/project/${projectId}/data-viewer`);
    },
    [currentPhase, currentPhaseLabel, isDataViewerUnlocked, openFileTab, navigate, projectId]
  );

  const markDeleted = useDataStore((s) => s.markDeleted);

  const buildDeleteFailureDescription = useCallback((error: unknown) => {
    if (!(error instanceof ApiError) || !error.payload || typeof error.payload !== 'object') {
      return null;
    }

    const payload = error.payload as {
      error?: string;
      message?: string;
      activeWorkflows?: Array<{
        runId: string;
        phase?: string | null;
        status?: string | null;
        pendingInputKind?: string | null;
        activeNotebookId?: string | null;
      }>;
    };

    if (payload.error !== 'DATASET_IN_USE') {
      return typeof payload.message === 'string' ? payload.message : null;
    }

    const blockers = Array.isArray(payload.activeWorkflows) ? payload.activeWorkflows : [];
    if (blockers.length === 0) {
      return payload.message ?? 'This dataset is still referenced by an active workflow.';
    }

    const formatRef = (value: string | null | undefined) => (value ? value.slice(0, 8) : null);

    return blockers
      .map((workflow) => {
        const phase = workflow.phase ? workflow.phase.replace(/_/g, ' ') : 'workflow';
        const status = workflow.status ?? 'active';
        const runRef = formatRef(workflow.runId) ?? 'unknown';
        const pending = workflow.pendingInputKind ? `, waiting for ${workflow.pendingInputKind}` : '';
        const notebookRef = formatRef(workflow.activeNotebookId);
        const notebook = notebookRef ? `, notebook ${notebookRef}` : '';
        return `${phase} run ${runRef} is ${status}${pending}${notebook}.`;
      })
      .join(' ');
  }, []);

  const handleDeleteFile = useCallback(
    async (file: UploadedFile) => {
      try {
        const { datasetId, documentId } = file.metadata ?? {};

        // Mark as recently deleted BEFORE the API call to guard against
        // concurrent hydrations re-adding the file.
        if (datasetId) markDeleted(datasetId);
        if (documentId) markDeleted(documentId);

        if (datasetId) await deleteDataset(datasetId);
        else if (documentId) await deleteDocument(documentId);
        removeFile(file.id);

        // Re-hydrate to reconcile local state with the backend's post-delete state.
        await useDataStore.getState().hydrateFromBackend(projectId, { force: true });
      } catch (error) {
        console.error('Failed to delete file:', error);
        toast.error(`Couldn't delete ${file.name}`, {
          description:
            buildDeleteFailureDescription(error)
            ?? (error instanceof Error ? error.message : 'The server rejected the delete request.')
        });
      }
    },
    [buildDeleteFailureDescription, removeFile, markDeleted, projectId]
  );

  const handleDownloadFile = useCallback(async (file: UploadedFile) => {
    try {
      await downloadFile(file);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  }, []);

  return {
    projectFiles,
    dataFiles,
    contextFiles,
    activeFileTabId,
    isOnDataViewer,
    handleOpenFile,
    handleDeleteFile,
    handleDownloadFile,
  };
}
