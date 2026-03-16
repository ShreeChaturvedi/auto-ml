import { useCallback, useEffect } from 'react';
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
  canDeleteCurrentDraft: boolean;
  approveVersion: (projectId: string, versionId: string) => void;
  handleVersionSwitch: (value: string) => void;
  handleNewDraft: () => void;
  handleDeleteDraft: () => void;
  handleRenameDraft: () => void;
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
    return () => {
      useWorkbookRegistryStore.getState().setWorkbooks('feature-engineering', []);
    };
  }, [versions]);

  // --- Derived version data ---
  const currentVersion = (() => {
    if (!currentVersionId) return versions[0];
    return versions.find((version) => version.id === currentVersionId) ?? versions[0];
  })();

  const isApproved = currentVersion?.status === 'approved';
  const isCurrentVersionDraft = currentVersion?.status === 'draft';
  const canDeleteCurrentDraft = Boolean(isCurrentVersionDraft);

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

  const handleDeleteDraft = useCallback(() => {
    if (!currentVersion || currentVersion.status !== 'draft') return;

    const shouldDelete = window.confirm(
      versions.length <= 1
        ? `Delete draft "${currentVersion.name}"? A fresh blank draft will be created.`
        : `Delete draft "${currentVersion.name}"?`
    );
    if (!shouldDelete) return;

    if (versions.length <= 1) {
      const deletedVersionId = currentVersion.id;
      createDraftVersion(projectId, 'Draft Pipeline v1');
      removeVersion(projectId, deletedVersionId);
    } else {
      removeVersion(projectId, currentVersion.id);
    }
    clearProjectFeatures(projectId);
    setSuggestionDrafts({});
    setApplyStatus('idle');
    setApplyMessage(null);
    setPanelError(null);
  }, [clearProjectFeatures, createDraftVersion, currentVersion, projectId, removeVersion, versions.length, setSuggestionDrafts, setPanelError, setApplyStatus, setApplyMessage]);

  const handleRenameDraft = useCallback(() => {
    if (!currentVersion || currentVersion.status !== 'draft') return;
    const nextName = window.prompt('Rename current draft pipeline:', currentVersion.name);
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed) {
      setPanelError('Draft name cannot be empty.');
      return;
    }
    renameVersion(projectId, currentVersion.id, trimmed);
    setPanelError(null);
  }, [currentVersion, projectId, renameVersion, setPanelError]);

  return {
    versions,
    currentVersionId,
    currentVersion,
    isApproved,
    isCurrentVersionDraft,
    canDeleteCurrentDraft,
    approveVersion,
    handleVersionSwitch,
    handleNewDraft,
    handleDeleteDraft,
    handleRenameDraft,
  };
}
