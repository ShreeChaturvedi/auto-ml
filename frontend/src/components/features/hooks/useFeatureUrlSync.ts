import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFeatureStore } from '@/stores/featureStore';
import type { PipelineVersion } from '@/types/feature';

interface UseFeatureUrlSyncOptions {
  projectId: string;
  currentVersion: PipelineVersion | null | undefined;
  handleVersionSwitch: (versionId: string) => void;
  handleNewDraft: () => void;
  handleDeleteDraft: () => void;
}

interface UseFeatureUrlSyncReturn {
  workbookParam: string | null;
  handleVersionSelect: (versionId: string) => void;
  handleCreateDraft: () => void;
  handleDeleteCurrentDraft: () => void;
}

export function useFeatureUrlSync({
  projectId,
  currentVersion,
  handleVersionSwitch,
  handleNewDraft,
  handleDeleteDraft
}: UseFeatureUrlSyncOptions): UseFeatureUrlSyncReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const workbookParam = useMemo(() => searchParams.get('workbook'), [searchParams]);

  // --- URL ↔ Version synchronization after mount ---
  useEffect(() => {
    if (workbookParam && workbookParam !== currentVersion?.id) {
      handleVersionSwitch(workbookParam);
    }
  }, [currentVersion?.id, handleVersionSwitch, workbookParam]);

  // --- Seed URL with currentVersion on initial load ---
  useEffect(() => {
    if (workbookParam || !currentVersion?.id) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set('workbook', currentVersion.id);
    setSearchParams(next, { replace: true });
  }, [currentVersion?.id, searchParams, setSearchParams, workbookParam]);

  // --- Update URL workbook parameter ---
  const updateWorkbookParam = useCallback(
    (versionId: string, replace = false) => {
      const next = new URLSearchParams(searchParams);
      next.set('workbook', versionId);
      setSearchParams(next, { replace });
    },
    [searchParams, setSearchParams]
  );

  // --- Wrapped version management callbacks ---
  const handleVersionSelect = useCallback(
    (versionId: string) => {
      handleVersionSwitch(versionId);
      updateWorkbookParam(versionId);
    },
    [handleVersionSwitch, updateWorkbookParam]
  );

  const handleCreateDraft = useCallback(() => {
    handleNewDraft();
    const nextVersionId = useFeatureStore.getState().currentVersionId[projectId];
    if (nextVersionId) {
      updateWorkbookParam(nextVersionId);
    }
  }, [handleNewDraft, projectId, updateWorkbookParam]);

  const handleDeleteCurrentDraft = useCallback(() => {
    const previousVersionId = currentVersion?.id;
    handleDeleteDraft();
    const nextState = useFeatureStore.getState();
    const nextVersionId = nextState.currentVersionId[projectId];

    if (nextVersionId && nextVersionId !== previousVersionId) {
      updateWorkbookParam(nextVersionId);
      return;
    }

    if (!nextVersionId) {
      const fallbackVersion = (nextState.versions[projectId] ?? [])[0];
      if (fallbackVersion) {
        const setCurrentVersion = useFeatureStore.getState().setCurrentVersion;
        setCurrentVersion(projectId, fallbackVersion.id);
        updateWorkbookParam(fallbackVersion.id);
      }
    }
  }, [currentVersion?.id, handleDeleteDraft, projectId, updateWorkbookParam]);

  return {
    workbookParam,
    handleVersionSelect,
    handleCreateDraft,
    handleDeleteCurrentDraft
  };
}
