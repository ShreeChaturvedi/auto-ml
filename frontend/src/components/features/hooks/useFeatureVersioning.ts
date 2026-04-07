import { useCallback, useEffect, useState } from 'react';
import { useFeatureStore } from '@/stores/featureStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { buildWorkflowSessionKey, useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { fetchFeatureRuns } from '@/lib/api/featureEngineering';
import { interruptWorkflowRun } from '@/lib/api/llm';
import * as notebooksApi from '@/lib/api/notebooks';
import type { PipelineVersion } from '@/types/feature';

const EMPTY_PIPELINE_VERSIONS: PipelineVersion[] = [];

interface UseFeatureVersioningOptions {
  projectId: string;
  setPanelError: (error: string | null) => void;
  setApplyStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void;
  setApplyMessage: (message: string | null) => void;
}

interface UseFeatureVersioningReturn {
  versions: PipelineVersion[];
  currentVersionId: string | undefined;
  currentVersion: PipelineVersion | undefined;
  chatSessionVersion: number;
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
  const setVersionNotebookId = useFeatureStore((state) => state.setVersionNotebookId);

  // --- Dialog state ---
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDialogValue, setRenameDialogValue] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatSessionVersion, setChatSessionVersion] = useState(0);

  const interruptDraftWorkflow = useCallback(async (
    versionId: string | undefined,
    reason: string
  ) => {
    if (!versionId) return;
    const storageKey = `feature-engineering-messages-v3-${versionId}`;
    const sessionKey = buildWorkflowSessionKey(projectId, storageKey);
    const session = useWorkflowSessionStore.getState().getSession(sessionKey);
    if (!session?.runId || !session.state) {
      useWorkflowSessionStore.getState().clearSession(sessionKey);
      return;
    }

    if (session.state.status !== 'running' && session.state.status !== 'paused') {
      useWorkflowSessionStore.getState().clearSession(sessionKey);
      return;
    }

    try {
      await interruptWorkflowRun(session.runId, reason);
    } catch (error) {
      console.warn('[feature-engineering] Failed to interrupt workflow run', error);
    } finally {
      useWorkflowSessionStore.getState().clearSession(sessionKey);
    }
  }, [projectId]);

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
    // clearProjectFeatures drops the features array from the store; because
    // suggestionDrafts is now derived from featureById in useSuggestionDrafts,
    // we no longer need to also reset local draft state here.
    clearProjectFeatures(projectId);
    setPanelError(null);
    setApplyStatus('idle');
    setApplyMessage(null);
  }, [clearProjectFeatures, createDraftVersion, projectId, setPanelError, setApplyStatus, setApplyMessage]);

  // --- Delete with shadcn AlertDialog ---
  const handleDeleteDraft = useCallback(() => {
    if (!currentVersion) return;
    setDeleteDialogOpen(true);
  }, [currentVersion]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!currentVersion) return;
    setDeleteDialogOpen(false);

    await interruptDraftWorkflow(currentVersion.id, 'Draft deleted by user.');

    if (versions.length <= 1) {
      const deletedVersionId = currentVersion.id;
      createDraftVersion(projectId, 'Draft Pipeline v1');
      removeVersion(projectId, deletedVersionId);
    } else {
      removeVersion(projectId, currentVersion.id);
    }
    clearProjectFeatures(projectId);
    clearDraft();
    setApplyStatus('idle');
    setApplyMessage(null);
    setPanelError(null);
  }, [clearDraft, clearProjectFeatures, createDraftVersion, currentVersion, interruptDraftWorkflow, projectId, removeVersion, versions.length, setPanelError, setApplyStatus, setApplyMessage]);

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
  const handleReset = useCallback(async () => {
    const versionId = currentVersion?.id;
    const versionName = currentVersion?.name;
    const oldNotebookId = currentVersion?.notebookId ?? null;
    const storageKey = `feature-engineering-messages-v3-${currentVersion?.id ?? 'default'}`;
    const messageStorageScope = `${storageKey}-${projectId}`;

    await interruptDraftWorkflow(currentVersion?.id, 'Draft reset by user.');

    if (versionId && versionName) {
      try {
        const nextNotebook = await notebooksApi.createNotebook(projectId, {
          name: versionName,
          metadata: {
            phase: 'feature-engineering',
            tabId: versionId,
            tabName: versionName
          }
        });

        setVersionNotebookId(projectId, versionId, nextNotebook.notebookId);
        await useNotebookStore.getState().initializeNotebook(projectId, nextNotebook.notebookId);

        if (oldNotebookId && oldNotebookId !== nextNotebook.notebookId) {
          await notebooksApi.deleteNotebook(projectId, oldNotebookId);
          await useNotebookStore.getState().loadNotebooks(projectId);
        }
      } catch (error) {
        console.warn('[feature-engineering] Failed to rotate draft notebook during reset', error);
      }
    }

    useWorkflowSessionStore.getState().clearSession(buildWorkflowSessionKey(projectId, storageKey));
    globalThis.localStorage?.removeItem(messageStorageScope);
    clearDraft();
    clearProjectFeatures(projectId);
    setPanelError(null);
    setApplyStatus('idle');
    setApplyMessage(null);
    setChatSessionVersion((value) => value + 1);
  }, [
    clearDraft,
    clearProjectFeatures,
    currentVersion?.id,
    currentVersion?.name,
    currentVersion?.notebookId,
    interruptDraftWorkflow,
    projectId,
    setPanelError,
    setApplyStatus,
    setApplyMessage,
    setVersionNotebookId
  ]);

  return {
    versions,
    currentVersionId,
    currentVersion,
    chatSessionVersion,
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
