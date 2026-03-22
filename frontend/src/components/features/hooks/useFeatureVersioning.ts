import { useCallback, useEffect, useState } from 'react';
import { useFeatureStore } from '@/stores/featureStore';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import type { PipelineVersion } from '@/types/feature';
import type { SuggestionDraft } from './useFeaturePipelineState';

const EMPTY_PIPELINE_VERSIONS: PipelineVersion[] = [];

interface UseFeatureVersioningOptions {
  projectId: string;
  setSuggestionDrafts: React.Dispatch<React.SetStateAction<Record<string, SuggestionDraft>>>;
  setPanelError: (error: string | null) => void;
  setApplyStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void;
  setApplyMessage: (message: string | null) => void;
}

interface UseFeatureVersioningReturn {
  versions: PipelineVersion[];
  currentVersionId: string | undefined;
  currentVersion: PipelineVersion | undefined;
  isApproved: boolean;
  isCurrentVersionDraft: boolean;
  approveVersion: (projectId: string, versionId: string) => void;
  handleVersionSwitch: (value: string) => void;
  handleNewDraft: () => void;
  handleDeleteDraft: () => void;
  handleRenameDraft: () => void;
  handleReset: () => void;
  // Dialog state for rename
  renameDialogOpen: boolean;
  setRenameDialogOpen: (open: boolean) => void;
  renameDialogValue: string;
  setRenameDialogValue: (value: string) => void;
  handleRenameConfirm: () => void;
  // Dialog state for delete confirmation
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  handleDeleteConfirm: () => void;
}

export function useFeatureVersioning({
  projectId,
  setSuggestionDrafts,
  setPanelError,
  setApplyStatus,
  setApplyMessage,
}: UseFeatureVersioningOptions): UseFeatureVersioningReturn {
  const versions = useFeatureStore((state) => state.versions[projectId] ?? EMPTY_PIPELINE_VERSIONS);
  const hasHydratedVersions = useFeatureStore((state) =>
    Object.prototype.hasOwnProperty.call(state.versions, projectId)
  );
  const hasHydratedCurrentVersion = useFeatureStore((state) =>
    Object.prototype.hasOwnProperty.call(state.currentVersionId, projectId)
  );
  const currentVersionId = useFeatureStore((state) => state.currentVersionId[projectId]);
  const createDraftVersion = useFeatureStore((state) => state.createDraftVersion);
  const removeVersion = useFeatureStore((state) => state.removeVersion);
  const renameVersion = useFeatureStore((state) => state.renameVersion);
  const approveVersion = useFeatureStore((state) => state.approveVersion);
  const setCurrentVersion = useFeatureStore((state) => state.setCurrentVersion);
  const clearProjectFeatures = useFeatureStore((state) => state.clearProjectFeatures);
  const clearDraft = useFeatureStore((state) => state.clearDraft);

  // --- Dialog state ---
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDialogValue, setRenameDialogValue] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // --- Version bootstrap effect ---
  useEffect(() => {
    if (!hasHydratedVersions || !hasHydratedCurrentVersion) return;

    if (versions.length === 0) {
      createDraftVersion(projectId, 'Draft Pipeline v1');
      return;
    }

    if (!currentVersionId && versions[0]) {
      setCurrentVersion(projectId, versions[0].id);
    }
  }, [
    createDraftVersion,
    currentVersionId,
    hasHydratedCurrentVersion,
    hasHydratedVersions,
    projectId,
    setCurrentVersion,
    versions
  ]);

  // --- Sync versions to workbook registry for sidebar rendering ---
  useEffect(() => {
    useWorkbookRegistryStore.getState().setWorkbooks(
      'feature-engineering',
      versions.map((v) => ({ id: v.id, name: v.name, notebookId: v.notebookId ?? null }))
    );
  }, [versions]);

  // --- Derived version data ---
  const currentVersion = (() => {
    if (!currentVersionId) return versions[0];
    return versions.find((version) => version.id === currentVersionId) ?? versions[0];
  })();

  const isApproved = currentVersion?.status === 'approved';
  const isCurrentVersionDraft = currentVersion?.status === 'draft';

  // --- Version actions ---
  const handleVersionSwitch = useCallback(
    (value: string) => {
      setPanelError(null);
      setCurrentVersion(projectId, value);
    },
    [projectId, setCurrentVersion, setPanelError]
  );

  const handleNewDraft = useCallback(() => {
    createDraftVersion(projectId, 'New Draft Pipeline');
    clearProjectFeatures(projectId);
    setSuggestionDrafts({});
    setPanelError(null);
    setApplyStatus('idle');
    setApplyMessage(null);
  }, [clearProjectFeatures, createDraftVersion, projectId, setSuggestionDrafts, setPanelError, setApplyStatus, setApplyMessage]);

  // --- Delete with shadcn AlertDialog ---
  const handleDeleteDraft = useCallback(() => {
    if (!currentVersion || currentVersion.status !== 'draft') return;
    setDeleteDialogOpen(true);
  }, [currentVersion]);

  const handleDeleteConfirm = useCallback(() => {
    if (!currentVersion || currentVersion.status !== 'draft') return;
    setDeleteDialogOpen(false);

    if (versions.length <= 1) {
      const deletedVersionId = currentVersion.id;
      createDraftVersion(projectId, 'Draft Pipeline v1');
      removeVersion(projectId, deletedVersionId);
    } else {
      removeVersion(projectId, currentVersion.id);
    }
    clearProjectFeatures(projectId);
    clearDraft();
    setSuggestionDrafts({});
    setApplyStatus('idle');
    setApplyMessage(null);
    setPanelError(null);
  }, [clearDraft, clearProjectFeatures, createDraftVersion, currentVersion, projectId, removeVersion, versions.length, setSuggestionDrafts, setPanelError, setApplyStatus, setApplyMessage]);

  // --- Rename with shadcn Dialog ---
  const handleRenameDraft = useCallback(() => {
    if (!currentVersion || currentVersion.status !== 'draft') return;
    setRenameDialogValue(currentVersion.name);
    setRenameDialogOpen(true);
  }, [currentVersion]);

  const handleRenameConfirm = useCallback(() => {
    if (!currentVersion) return;
    const trimmed = renameDialogValue.trim();
    if (!trimmed) {
      setPanelError('Draft name cannot be empty.');
      return;
    }
    renameVersion(projectId, currentVersion.id, trimmed);
    setRenameDialogOpen(false);
    setPanelError(null);
  }, [currentVersion, projectId, renameDialogValue, renameVersion, setPanelError]);

  // --- Reset handler ---
  const handleReset = useCallback(() => {
    clearDraft();
    clearProjectFeatures(projectId);
    setSuggestionDrafts({});
    setPanelError(null);
    setApplyStatus('idle');
    setApplyMessage(null);
  }, [clearDraft, clearProjectFeatures, projectId, setSuggestionDrafts, setPanelError, setApplyStatus, setApplyMessage]);

  return {
    versions,
    currentVersionId,
    currentVersion,
    isApproved,
    isCurrentVersionDraft,
    approveVersion,
    handleVersionSwitch,
    handleNewDraft,
    handleDeleteDraft,
    handleRenameDraft,
    handleReset,
    renameDialogOpen,
    setRenameDialogOpen,
    renameDialogValue,
    setRenameDialogValue,
    handleRenameConfirm,
    deleteDialogOpen,
    setDeleteDialogOpen,
    handleDeleteConfirm,
  };
}
