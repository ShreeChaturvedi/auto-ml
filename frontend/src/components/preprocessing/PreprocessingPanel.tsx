import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { AgenticShell } from '@/components/agentic/AgenticShell';
import { createPreprocessingAdapter } from './PreprocessingAdapter';
import { buildDatasetContinuityPrompt } from './continuityPrompt';
import { RenameTabDialog } from './PreprocessingDialogs';
import { DatasetSelector } from './DatasetSelector';
import { useDatasetSelectorTrigger } from './useDatasetSelectorTrigger';
import {
  PreprocessingToolbarLeft,
  PreprocessingToolbarRight
} from './PreprocessingToolbar';
import { PreprocessingChatSection } from './PreprocessingChatSection';
import { PreprocessingResultsSection } from './PreprocessingResultsSection';
import { TransformationTimelineSheet } from './TransformationTimelineSheet';
import { cn } from '@/lib/utils';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses } from '@/types/project';
import { DatasetContinuityDialog } from './DatasetContinuityDialog';
import { usePreprocessingTabs } from './hooks/usePreprocessingTabs';
import { DEFAULT_TAB_ID } from './preprocessingTabUtils';

export function PreprocessingPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const projects = useProjectStore((state) => state.projects);
  const activeProjectColor = useMemo(() => {
    const activeProject = projectId
      ? projects.find((project) => project.id === projectId)
      : undefined;
    return activeProject?.color ?? 'blue';
  }, [projectId, projects]);
  const projectAccentClasses = projectColorClasses[activeProjectColor];
  const divergedAccentClassName = cn(
    projectAccentClasses.border,
    projectAccentClasses.bg,
    projectAccentClasses.text
  );

  const tables = usePreprocessingStore((state) => state.tables);
  const selectedDatasetId = usePreprocessingStore((state) => state.selectedDatasetId);
  const runId = usePreprocessingStore((state) => state.runId);
  const timeline = usePreprocessingStore((state) => state.timeline);
  const isLoadingTables = usePreprocessingStore((state) => state.isLoadingTables);
  const storeError = usePreprocessingStore((state) => state.error);
  const loadTables = usePreprocessingStore((state) => state.loadTables);
  const selectDataset = usePreprocessingStore((state) => state.selectDataset);
  const setNextRunCellMode = usePreprocessingStore((state) => state.setNextRunCellMode);
  const hydrateRunById = usePreprocessingStore((state) => state.hydrateRunById);
  const approveStep = usePreprocessingStore((state) => state.approveStep);
  const rejectStep = usePreprocessingStore((state) => state.rejectStep);
  const evaluateReplayCompatibility = usePreprocessingStore((state) => state.evaluateReplayCompatibility);
  const clearRun = usePreprocessingStore((state) => state.clearRun);
  const replayReport = usePreprocessingStore((state) => state.replayReport);
  const lastHydratedRunIdRef = useRef<string | null>(null);
  const submitPromptResolverRef = useRef<((prompt: string | null) => void) | null>(null);

  const [isSubmitChoiceOpen, setSubmitChoiceOpen] = useState(false);
  const [pendingSubmitPrompt, setPendingSubmitPrompt] = useState('');
  const [timelineSheetOpen, setTimelineSheetOpen] = useState(false);
  const handleOpenTimeline = useCallback(() => setTimelineSheetOpen(true), []);

  const { forceOpen: datasetSelectorForceOpen, openSelector: openDatasetSelector } =
    useDatasetSelectorTrigger();

  const {
    tabs,
    activeTab,
    buildTabStorageKey,
    handleTabSwitch,
    handleNewTab,
    handleDeleteTab,
    openRenameTabDialog,
    handleRenameTab,
    renameTabDialogOpen,
    setRenameTabDialogOpen,
    renameTabName,
    setRenameTabName,
    resetActiveTab
  } = usePreprocessingTabs({
    projectId,
    onNeedsDatasetSelection: useCallback(() => {
      openDatasetSelector();
    }, [openDatasetSelector])
  });

  useEffect(() => {
    if (projectId) {
      void loadTables(projectId);
    }
  }, [projectId, loadTables]);

  useEffect(() => {
    if (!projectId || !runId) {
      return;
    }
    if (lastHydratedRunIdRef.current === runId) {
      return;
    }
    let cancelled = false;
    void hydrateRunById(projectId, runId).then(() => {
      if (!cancelled) {
        lastHydratedRunIdRef.current = runId;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hydrateRunById, projectId, runId]);

  const selectedTable = useMemo(
    () => tables.find((table) => table.datasetId === selectedDatasetId),
    [tables, selectedDatasetId]
  );

  const resolvePendingSubmitPrompt = (nextPrompt: string | null) => {
    const resolver = submitPromptResolverRef.current;
    submitPromptResolverRef.current = null;
    setSubmitChoiceOpen(false);
    setPendingSubmitPrompt('');
    resolver?.(nextPrompt);
  };

  const requestDatasetContinuityChoice = (prompt: string): Promise<string | null> => {
    if (!selectedDatasetId) {
      openDatasetSelector();
      return Promise.resolve(null);
    }
    return new Promise<string | null>((resolve) => {
      submitPromptResolverRef.current = resolve;
      setPendingSubmitPrompt(prompt);
      setSubmitChoiceOpen(true);
    });
  };

  const handleUseCurrentDataset = () => {
    setNextRunCellMode('continue');
    resolvePendingSubmitPrompt(buildDatasetContinuityPrompt(
      pendingSubmitPrompt,
      'continue',
      {
        datasetId: selectedDatasetId,
        datasetLabel: selectedTable?.filename
      }
    ));
  };

  const handleUseOriginalDataset = () => {
    setNextRunCellMode('restart_from_original');
    clearRun();
    resolvePendingSubmitPrompt(buildDatasetContinuityPrompt(
      pendingSubmitPrompt,
      'restart_from_original',
      {
        datasetId: selectedDatasetId,
        datasetLabel: selectedTable?.filename
      }
    ));
  };

  const sortedTimeline = useMemo(
    () => [...timeline].sort((a, b) => a.createdAt - b.createdAt),
    [timeline]
  );
  const latestTimelineEvent = useMemo(
    () => [...timeline].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null,
    [timeline]
  );
  const hasRunningStep = useMemo(
    () => sortedTimeline.some((e) => e.status === 'running'),
    [sortedTimeline]
  );
  const hasAwaitingApproval = useMemo(
    () => sortedTimeline.some((e) => e.status === 'awaiting_approval'),
    [sortedTimeline]
  );

  const handleReplayCheck = () => {
    if (!projectId) {
      return;
    }
    void evaluateReplayCompatibility(projectId);
  };

  const handleApproveStep = useCallback((stepId: string) => {
    if (!projectId) {
      return;
    }
    void approveStep(projectId, stepId);
  }, [approveStep, projectId]);

  const handleRejectStep = useCallback((stepId: string) => {
    if (!projectId) {
      return;
    }
    void rejectStep(projectId, stepId, 'Rejected by user');
  }, [projectId, rejectStep]);

  const handleDatasetSelect = (datasetId: string) => {
    selectDataset(datasetId);
    clearRun();
  };

  const domainAdapter = useMemo(() => {
    return createPreprocessingAdapter(projectId ?? '', selectedDatasetId, tables);
  }, [projectId, selectedDatasetId, tables]);

  return (
    <>
      <AgenticShell
        projectId={projectId ?? ''}
        domainAdapter={domainAdapter}
        beforeSubmit={requestDatasetContinuityChoice}
        storageKey={buildTabStorageKey(activeTab?.id ?? DEFAULT_TAB_ID)}
        sessionVersion={activeTab?.storageVersion ?? 0}
        toolbarLeft={
          <PreprocessingToolbarLeft
            tabs={tabs.map((tab) => ({ id: tab.id, name: tab.name }))}
            activeTabId={activeTab?.id ?? ''}
            onTabSwitch={handleTabSwitch}
            onNewTab={handleNewTab}
            onRenameTab={openRenameTabDialog}
            onReplayCheck={handleReplayCheck}
            onResetTab={resetActiveTab}
            onDeleteTab={handleDeleteTab}
            canDeleteTab={tabs.length > 1}
            selectedDatasetId={selectedDatasetId ?? ''}
            onOpenTimeline={handleOpenTimeline}
            timelineStepCount={sortedTimeline.length}
            hasAwaitingApproval={hasAwaitingApproval}
          />
        }
        toolbarRight={
          <PreprocessingToolbarRight
            selectedDatasetId={selectedDatasetId ?? ''}
            tables={tables}
            onDatasetSelect={handleDatasetSelect}
            isLoadingTables={isLoadingTables}
          />
        }
        composerStatusSlot={
          <PreprocessingResultsSection
            storeError={storeError}
            latestTimelineEvent={latestTimelineEvent}
            divergedAccentClassName={divergedAccentClassName}
            onOpenTimeline={handleOpenTimeline}
          />
        }
        LeftPaneComponent={(renderProps) => (
          <PreprocessingChatSection
            {...renderProps}
            storeError={storeError}
            sortedTimeline={sortedTimeline}
            onOpenTimeline={handleOpenTimeline}
          />
        )}
      />

      <DatasetSelector
        tables={tables}
        selectedDatasetId={selectedDatasetId}
        onSelectDataset={selectDataset}
        forceOpen={datasetSelectorForceOpen}
      />

      <RenameTabDialog
        open={renameTabDialogOpen}
        onOpenChange={setRenameTabDialogOpen}
        value={renameTabName}
        onValueChange={setRenameTabName}
        onSave={handleRenameTab}
      />

      <DatasetContinuityDialog
        open={isSubmitChoiceOpen}
        onOpenChange={setSubmitChoiceOpen}
        selectedTableFilename={selectedTable?.filename}
        onUseCurrentDataset={handleUseCurrentDataset}
        onUseOriginalDataset={handleUseOriginalDataset}
        onCancel={() => resolvePendingSubmitPrompt(null)}
      />

      <TransformationTimelineSheet
        sortedTimeline={sortedTimeline}
        replayReport={replayReport}
        divergedAccentClassName={divergedAccentClassName}
        isGenerating={hasRunningStep}
        onApproveStep={handleApproveStep}
        onRejectStep={handleRejectStep}
        open={timelineSheetOpen}
        onOpenChange={setTimelineSheetOpen}
      />
    </>
  );
}
