import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ChatMessageRenderer } from '@/components/agentic/ChatMessageRenderer';
import { useLifecycleCards } from '@/components/agentic/useLifecycleCards';
import { useWorkflowPlaceholders } from '@/hooks/useWorkflowPlaceholders';
import { createPreprocessingAdapter } from './PreprocessingAdapter';
import { buildDatasetContinuityPrompt } from './continuityPrompt';
import { DatasetContinuityDialog } from './DatasetContinuityDialog';
import { RenameTabDialog } from './PreprocessingDialogs';
import { DatasetSelector } from './DatasetSelector';
import { useDatasetSelectorTrigger } from './useDatasetSelectorTrigger';
import {
  PreprocessingToolbarLeft,
  PreprocessingToolbarRight
} from './PreprocessingToolbar';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { buildWorkflowSessionKey, useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { usePreprocessingTabs } from './hooks/usePreprocessingTabs';
import { DEFAULT_WORKBOOK_ID } from './preprocessingTabUtils';
import { usePreprocessingPanelSearchState } from './usePreprocessingPanelSearchState';
import { getWorkbookParam } from '@/lib/workbookParam';

function usePreprocessingRunHydration(
  projectId: string | undefined,
  runId: string | null,
  hydrateRunById: (projectId: string, runId: string) => Promise<void>,
  invalidateActiveTabSession: () => void,
) {
  const lastHydratedRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId || !runId || lastHydratedRunIdRef.current === runId) {
      return;
    }

    let cancelled = false;
    void hydrateRunById(projectId, runId).then(() => {
      const hydratedRunId = usePreprocessingStore.getState().runId;
      if (cancelled) {
        return;
      }
      if (!hydratedRunId) {
        invalidateActiveTabSession();
        lastHydratedRunIdRef.current = null;
        return;
      }
      lastHydratedRunIdRef.current = hydratedRunId;
    });

    return () => {
      cancelled = true;
    };
  }, [hydrateRunById, invalidateActiveTabSession, projectId, runId]);
}

function useDatasetContinuityChoice(
  selectedDatasetId: string | null,
  selectedTableFilename: string | undefined,
  openDatasetSelector: () => void,
  setNextRunCellMode: (mode: 'continue' | 'restart_from_original') => void,
  clearRun: () => void,
) {
  const submitPromptResolverRef = useRef<((prompt: string | null) => void) | null>(null);
  const [isSubmitChoiceOpen, setSubmitChoiceOpen] = useState(false);
  const [pendingSubmitPrompt, setPendingSubmitPrompt] = useState('');

  const resolvePendingSubmitPrompt = useCallback((nextPrompt: string | null) => {
    const resolver = submitPromptResolverRef.current;
    submitPromptResolverRef.current = null;
    setSubmitChoiceOpen(false);
    setPendingSubmitPrompt('');
    resolver?.(nextPrompt);
  }, []);

  const requestDatasetContinuityChoice = useCallback((prompt: string): Promise<string | null> => {
    if (!selectedDatasetId) {
      openDatasetSelector();
      toast.info('Select a dataset to get started', {
        description: 'Choose a dataset from the selector, then re-send your prompt.'
      });
      return Promise.resolve(null);
    }

    return new Promise<string | null>((resolve) => {
      submitPromptResolverRef.current = resolve;
      setPendingSubmitPrompt(prompt);
      setSubmitChoiceOpen(true);
    });
  }, [openDatasetSelector, selectedDatasetId]);

  const buildContinuityPrompt = useCallback((mode: 'continue' | 'restart_from_original') => (
    buildDatasetContinuityPrompt(pendingSubmitPrompt, mode, {
      datasetId: selectedDatasetId,
      datasetLabel: selectedTableFilename
    })
  ), [pendingSubmitPrompt, selectedDatasetId, selectedTableFilename]);

  const handleUseCurrentDataset = useCallback(() => {
    setNextRunCellMode('continue');
    resolvePendingSubmitPrompt(buildContinuityPrompt('continue'));
  }, [buildContinuityPrompt, resolvePendingSubmitPrompt, setNextRunCellMode]);

  const handleUseOriginalDataset = useCallback(() => {
    setNextRunCellMode('restart_from_original');
    clearRun();
    resolvePendingSubmitPrompt(buildContinuityPrompt('restart_from_original'));
  }, [buildContinuityPrompt, clearRun, resolvePendingSubmitPrompt, setNextRunCellMode]);

  return {
    isSubmitChoiceOpen,
    setSubmitChoiceOpen,
    requestDatasetContinuityChoice,
    handleUseCurrentDataset,
    handleUseOriginalDataset,
    handleCancelChoice: () => resolvePendingSubmitPrompt(null)
  };
}

export function PreprocessingPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const composerPlaceholders = useWorkflowPlaceholders(projectId, 'preprocessing');
  const {
    searchParams,
    initialTabId,
    initialNotebookId,
    insightInitialPrompt,
    syncWorkbookParam
  } = usePreprocessingPanelSearchState();
  const requestedTabId = getWorkbookParam(searchParams);

  const tables = usePreprocessingStore((state) => state.tables);
  const selectedDatasetId = usePreprocessingStore((state) => state.selectedDatasetId);
  const runId = usePreprocessingStore((state) => state.runId);
  const isLoadingTables = usePreprocessingStore((state) => state.isLoadingTables);
  const loadTables = usePreprocessingStore((state) => state.loadTables);
  const selectDataset = usePreprocessingStore((state) => state.selectDataset);
  const setNextRunCellMode = usePreprocessingStore((state) => state.setNextRunCellMode);
  const hydrateRunById = usePreprocessingStore((state) => state.hydrateRunById);
  const evaluateReplayCompatibility = usePreprocessingStore((state) => state.evaluateReplayCompatibility);
  const clearRun = usePreprocessingStore((state) => state.clearRun);

  const { forceOpen: datasetSelectorForceOpen, openSelector: openDatasetSelector } =
    useDatasetSelectorTrigger();

  const {
    tabs,
    activeTab,
    tabsReady,
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
    resetActiveTab,
    invalidateActiveTabSession
  } = usePreprocessingTabs({
    projectId,
    initialTabId,
    initialNotebookId,
    requestedTabId,
    syncWorkbookParam,
    onNeedsDatasetSelection: useCallback(() => {
      openDatasetSelector();
    }, [openDatasetSelector])
  });

  useEffect(() => {
    if (projectId) {
      void loadTables(projectId);
    }
  }, [projectId, loadTables]);

  const selectedTable = useMemo(
    () => tables.find((table) => table.datasetId === selectedDatasetId),
    [tables, selectedDatasetId]
  );
  const {
    isSubmitChoiceOpen,
    setSubmitChoiceOpen,
    handleUseCurrentDataset,
    handleUseOriginalDataset,
    handleCancelChoice
  } = useDatasetContinuityChoice(
    selectedDatasetId,
    selectedTable?.filename,
    openDatasetSelector,
    setNextRunCellMode,
    clearRun
  );

  usePreprocessingRunHydration(projectId, runId, hydrateRunById, invalidateActiveTabSession);

  const preparePreprocessingPrompt = useCallback(async (prompt: string): Promise<string | null> => {
    if (!selectedDatasetId) {
      openDatasetSelector();
      toast.info('Select a dataset to get started', {
        description: 'Choose a dataset from the selector, then re-send your prompt.'
      });
      return null;
    }
    setNextRunCellMode('continue');
    return buildDatasetContinuityPrompt(
      prompt,
      'continue',
      {
        datasetId: selectedDatasetId,
        datasetLabel: selectedTable?.filename
      }
    );
  }, [openDatasetSelector, selectedDatasetId, selectedTable?.filename, setNextRunCellMode]);

  const handleReplayCheck = () => {
    if (!projectId) {
      return;
    }
    void evaluateReplayCompatibility(projectId);
  };

  const handleDatasetSelect = (datasetId: string) => {
    const storageKey = buildTabStorageKey(activeTab?.id ?? DEFAULT_WORKBOOK_ID);
    if (projectId) {
      useWorkflowSessionStore.getState().clearSession(buildWorkflowSessionKey(projectId, storageKey));
    }
    selectDataset(datasetId);
    clearRun();
  };

  const renderLifecycleCard = useLifecycleCards();

  const domainAdapter = useMemo(() => {
    const storageKey = buildTabStorageKey(activeTab?.id ?? DEFAULT_WORKBOOK_ID);
    return createPreprocessingAdapter(
      projectId ?? '',
      selectedDatasetId,
      tables,
      projectId ? buildWorkflowSessionKey(projectId, storageKey) : storageKey,
      activeTab?.notebookId
    );
  }, [activeTab?.id, activeTab?.notebookId, buildTabStorageKey, projectId, selectedDatasetId, tables]);

  return (
    <>
      <AgenticShell
        key={activeTab?.id ?? DEFAULT_WORKBOOK_ID}
        projectId={projectId ?? ''}
        domainAdapter={domainAdapter}
        composerPlaceholders={composerPlaceholders}
        beforeSubmit={preparePreprocessingPrompt}
        storageKey={buildTabStorageKey(activeTab?.id ?? DEFAULT_WORKBOOK_ID)}
        sessionVersion={activeTab?.storageVersion ?? 0}
        initialPrompt={insightInitialPrompt}
        notebookId={activeTab?.notebookId}
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
            canReplay={!!selectedDatasetId}
            canDelete={tabs.length > 1}
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
        renderLeftPane={(renderProps) => (
          <div className="mx-auto w-full max-w-5xl space-y-4 p-6 pb-28">
            <ChatMessageRenderer
              messages={renderProps.messages}
              renderLifecycleCard={renderLifecycleCard}
              activeTextMessageId={renderProps.activeTextMessageId}
              activeThinkingMessageId={renderProps.activeThinkingMessageId}
              hydratedMessageIds={renderProps.hydratedMessageIds}
              onEditMessage={renderProps.onEditMessage}
              onRevertToMessage={renderProps.onRevertToMessage}
              editingMessageId={renderProps.editingMessageId}
              turnDiffs={renderProps.turnDiffs}
              isGenerating={renderProps.isGenerating}
              onRetryWorkflow={renderProps.onRetryWorkflow}
            />
          </div>
        )}
      />

      <DatasetSelector
        tables={tables}
        selectedDatasetId={selectedDatasetId}
        onSelectDataset={selectDataset}
        forceOpen={datasetSelectorForceOpen}
        tabsReady={tabsReady}
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
        onCancel={handleCancelChoice}
      />


    </>
  );
}
