import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ChatMessageRenderer } from '@/components/agentic/ChatMessageRenderer';
import { useLifecycleCards } from '@/components/agentic/useLifecycleCards';
import { createPreprocessingAdapter } from './PreprocessingAdapter';
import { buildDatasetContinuityPrompt } from './continuityPrompt';
import { RenameTabDialog } from './PreprocessingDialogs';
import { DatasetSelector } from './DatasetSelector';
import { useDatasetSelectorTrigger } from './useDatasetSelectorTrigger';
import {
  PreprocessingToolbarLeft,
  PreprocessingToolbarRight
} from './PreprocessingToolbar';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { buildWorkflowSessionKey, useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { DatasetContinuityDialog } from './DatasetContinuityDialog';
import { usePreprocessingTabs } from './hooks/usePreprocessingTabs';
import { DEFAULT_WORKBOOK_ID } from './preprocessingTabUtils';
import { getWorkbookParam } from '@/lib/workbookParam';

/**
 * Build a natural-language prompt for the preprocessing agent based on
 * insight parameters from the Data Viewer.
 */
function buildInsightPrompt(column: string, issueType: string): string {
  switch (issueType) {
    case 'missing':
      return `The column "${column}" has a significant number of missing values. Please analyze the missing data pattern and suggest the best imputation strategy or whether the column should be dropped.`;
    case 'constant':
      return `The column "${column}" is constant (all values are the same) and provides no predictive signal. Please drop this column from the dataset.`;
    case 'imbalance':
      return `The column "${column}" has significant class imbalance. Please analyze the distribution and suggest resampling or balancing strategies.`;
    default:
      return `Please address the "${issueType}" issue detected in the column "${column}".`;
  }
}

export function PreprocessingPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTabIdRef = useRef(getWorkbookParam(searchParams));
  const initialNotebookIdRef = useRef(searchParams.get('notebook') ?? undefined);

  // Read insight search params (set by Data Viewer "preprocess" action) on mount.
  // Compute once and store in state so it survives re-renders without re-reading
  // (search params are cleared immediately after reading).
  const [insightInitialPrompt] = useState<string | null>(() => {
    const col = searchParams.get('insightColumn');
    const issue = searchParams.get('insightIssue');
    if (!col || !issue) return null;
    return buildInsightPrompt(col, issue);
  });
  const hadInsightParams = insightInitialPrompt !== null;

  // Clear insight search params after reading to avoid re-triggering on re-render
  useEffect(() => {
    if (!hadInsightParams) return;
    const next = new URLSearchParams(searchParams);
    next.delete('insightColumn');
    next.delete('insightIssue');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

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
  const lastHydratedRunIdRef = useRef<string | null>(null);
  const submitPromptResolverRef = useRef<((prompt: string | null) => void) | null>(null);

  const [isSubmitChoiceOpen, setSubmitChoiceOpen] = useState(false);
  const [pendingSubmitPrompt, setPendingSubmitPrompt] = useState('');

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
    resetActiveTab
  } = usePreprocessingTabs({
    projectId,
    initialTabId: initialTabIdRef.current,
    initialNotebookId: initialNotebookIdRef.current,
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
      projectId ? buildWorkflowSessionKey(projectId, storageKey) : storageKey
    );
  }, [activeTab?.id, buildTabStorageKey, projectId, selectedDatasetId, tables]);

  return (
    <>
      <AgenticShell
        projectId={projectId ?? ''}
        domainAdapter={domainAdapter}
        beforeSubmit={requestDatasetContinuityChoice}
        storageKey={buildTabStorageKey(activeTab?.id ?? DEFAULT_WORKBOOK_ID)}
        sessionVersion={activeTab?.storageVersion ?? 0}
        initialPrompt={insightInitialPrompt}
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
        onCancel={() => resolvePendingSubmitPrompt(null)}
      />

    </>
  );
}
