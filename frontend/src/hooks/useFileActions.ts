/**
 * useFileActions — shared hook for file operations (open, delete, download)
 * and data/context file partitioning. Used by both FileSubtabs (sidebar) and FileExplorer (panel).
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { phaseConfig } from '@/types/phase';
import { deleteDataset, downloadDataset } from '@/lib/api/datasets';
import { deleteDocument, downloadDocument } from '@/lib/api/documents';
import { DATA_FILE_TYPES } from '@/lib/fileUtils';
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
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const currentPhase = project?.currentPhase;
  const currentPhaseLabel = currentPhase
    ? (phaseConfig[currentPhase]?.label ?? 'the current step')
    : 'the current step';

  useEffect(() => {
    if (projectId) void useDataStore.getState().hydrateFromBackend(projectId);
  }, [projectId]);

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
      }
    },
    [removeFile, markDeleted, projectId]
  );

  const handleDownloadFile = useCallback(async (file: UploadedFile) => {
    try {
      const { datasetId, documentId } = file.metadata ?? {};
      let blob: Blob;
      if (datasetId) {
        blob = new Blob([await downloadDataset(datasetId)]);
      } else if (documentId) {
        blob = await downloadDocument(documentId);
      } else {
        console.error('No dataset or document ID found for download');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
