import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeatureStore } from '@/stores/featureStore';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { buildWorkflowSessionKey, useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { fetchFeatureRuns } from '@/lib/api/featureEngineering';
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
  handleReplay: () => void;
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

  // --- Ephemeral state reset (shared across version lifecycle actions) ---
  const clearEphemeralState = useCallback(() => {
    setSuggestionDrafts({});
    setApplyStatus('idle');
    setApplyMessage(null);
    setPanelError(null);
  }, [setSuggestionDrafts, setApplyStatus, setApplyMessage, setPanelError]);

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
  }, [clearProjectFeatures, createDraftVersion, projectId]);

  // --- Core delete logic (shared by toolbar dialog + sidebar handler) ---
  const deleteDraftById = useCallback((versionId: string): string | undefined => {
    const store = useFeatureStore.getState();
    const projectVersions = store.versions[projectId] ?? [];
    const target = projectVersions.find((v) => v.id === versionId);
    if (!target || target.status !== 'draft') return undefined;

    if (projectVersions.length <= 1) {
      store.createDraftVersion(projectId, 'Draft Pipeline v1');
    }
    store.removeVersion(projectId, versionId);
    store.clearProjectFeatures(projectId);
    store.clearDraft();

    return useFeatureStore.getState().currentVersionId[projectId] || undefined;
  }, [projectId]);

  // --- Register sidebar delete handler ---
  useEffect(() => {
    useWorkbookRegistryStore.getState().setDeleteHandler('feature-engineering', deleteDraftById);
    return () => useWorkbookRegistryStore.getState().setDeleteHandler('feature-engineering', null);
  }, [deleteDraftById]);

  // --- Clear component-local ephemeral state on version change ---
  const prevVersionIdRef = useRef(currentVersionId);
  useEffect(() => {
    if (prevVersionIdRef.current && prevVersionIdRef.current !== currentVersionId) {
      clearEphemeralState();
    }
    prevVersionIdRef.current = currentVersionId;
  }, [currentVersionId, clearEphemeralState]);

  // --- Delete with shadcn AlertDialog ---
  const handleDeleteDraft = useCallback(() => {
    if (!currentVersion || currentVersion.status !== 'draft') return;
    setDeleteDialogOpen(true);
  }, [currentVersion]);

  const handleDeleteConfirm = useCallback(() => {
    if (!currentVersion || currentVersion.status !== 'draft') return;
    setDeleteDialogOpen(false);
    deleteDraftById(currentVersion.id);
  }, [currentVersion, deleteDraftById]);

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

  // --- Replay: re-hydrate feature lifecycle state from backend ---
  const handleReplay = useCallback(() => {
    void fetchFeatureRuns(projectId, 1)
      .then(({ runs }) => {
        if (runs.length === 0) return;
        const run = runs[0];
        const store = useFeatureStore.getState();
        store.setFeatureRunId(run.runId);
        // Re-hydrate each feature step from the persisted run
        for (const [featureId, step] of Object.entries(run.features)) {
          store.setFeatureStep(featureId, {
            stepId: step.featureId,
            name: step.name,
            method: step.method,
            status: step.status,
            code: step.code,
            metrics: step.validation as Record<string, unknown> | undefined
          });
        }
      })
      .catch(() => {
        setPanelError('Failed to replay feature pipeline state from backend.');
      });
  }, [projectId, setPanelError]);

  // --- Reset handler ---
  const handleReset = useCallback(() => {
    const storageKey = `feature-engineering-messages-v3-${currentVersion?.id ?? 'default'}`;
    useWorkflowSessionStore.getState().clearSession(buildWorkflowSessionKey(projectId, storageKey));
    clearDraft();
    clearProjectFeatures(projectId);
    clearEphemeralState();
  }, [clearDraft, clearProjectFeatures, currentVersion?.id, projectId, clearEphemeralState]);

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
    handleReplay,
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
