import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useFeatureStore } from '@/stores/featureStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { buildWorkflowSessionKey, useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { fetchFeatureRuns } from '@/lib/api/featureEngineering';
import { interruptWorkflowRun } from '@/lib/api/llm';
import * as notebooksApi from '@/lib/api/notebooks';
import { archivePhaseNotebook } from '@/lib/notebook/archivePhaseNotebook';
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
  const renameVersion = useFeatureStore((state) => state.renameVersion);
  const approveVersion = useFeatureStore((state) => state.approveVersion);
  const setCurrentVersion = useFeatureStore((state) => state.setCurrentVersion);
  const clearProjectFeatures = useFeatureStore((state) => state.clearProjectFeatures);
  const clearVersionFeatures = useFeatureStore((state) => state.clearVersionFeatures);
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

  useEffect(() => {
    useWorkbookRegistryStore
      .getState()
      .setActiveWorkbookId('feature-engineering', currentVersionId ?? null);
  }, [currentVersionId]);

  // --- Derived version data ---
  const currentVersion = (() => {
    if (!currentVersionId) return versions[0];
    return versions.find((version) => version.id === currentVersionId) ?? versions[0];
  })();

  const isApproved = currentVersion?.status === 'approved';
  const isCurrentVersionDraft = currentVersion?.status === 'draft';

  // --- Ephemeral state reset (shared across version lifecycle actions) ---
  const clearEphemeralState = useCallback(() => {
    setApplyStatus('idle');
    setApplyMessage(null);
    setPanelError(null);
  }, [setApplyStatus, setApplyMessage, setPanelError]);

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
    clearDraft();
    clearEphemeralState();
    toast.success('New Draft Pipeline created');
  }, [clearDraft, clearEphemeralState, createDraftVersion, projectId]);

  // --- Core delete logic (shared by toolbar dialog + sidebar handler) ---
  const deleteDraftById = useCallback((versionId: string): string | undefined => {
    const store = useFeatureStore.getState();
    const projectVersions = store.versions[projectId] ?? [];
    const target = projectVersions.find((v) => v.id === versionId);
    if (!target) {
      toast.error('Draft not found');
      return undefined;
    }
    if (target.status !== 'draft') {
      toast.error('Only draft pipelines can be deleted');
      return undefined;
    }

    if (projectVersions.length <= 1) {
      store.createDraftVersion(projectId, 'Draft Pipeline v1');
    }
    store.removeVersion(projectId, versionId);
    store.clearVersionFeatures(projectId, versionId);
    store.clearDraft();
    toast.success(`${target.name} deleted`);

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
    if (!currentVersion) return;
    setDeleteDialogOpen(true);
  }, [currentVersion]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!currentVersion) return;
    setDeleteDialogOpen(false);
    await interruptDraftWorkflow(currentVersion.id, 'Draft deleted by user.');
    deleteDraftById(currentVersion.id);
    clearEphemeralState();
  }, [currentVersion, deleteDraftById, interruptDraftWorkflow, clearEphemeralState]);

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
    let resetWarning: string | null = null;

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
          await archivePhaseNotebook({
            projectId,
            notebookId: oldNotebookId,
            phase: 'feature-engineering',
            tabId: versionId,
            tabName: versionName
          });
          await useNotebookStore.getState().loadNotebooks(projectId);
        }
      } catch (error) {
        console.warn('[feature-engineering] Failed to rotate draft notebook during reset', error);
        resetWarning = error instanceof Error ? error.message : 'Failed to rotate the draft notebook.';
      }
    }

    useWorkflowSessionStore.getState().clearSession(buildWorkflowSessionKey(projectId, storageKey));
    globalThis.localStorage?.removeItem(messageStorageScope);
    clearDraft();
    if (currentVersion?.id) {
      clearVersionFeatures(projectId, currentVersion.id);
    } else {
      clearProjectFeatures(projectId);
    }
    clearEphemeralState();
    setChatSessionVersion((value) => value + 1);
    toast.success(`${versionName ?? 'Draft'} reset`, resetWarning ? { description: resetWarning } : undefined);
  }, [
    clearDraft,
    clearVersionFeatures,
    clearProjectFeatures,
    currentVersion?.id,
    currentVersion?.name,
    currentVersion?.notebookId,
    interruptDraftWorkflow,
    projectId,
    clearEphemeralState,
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
