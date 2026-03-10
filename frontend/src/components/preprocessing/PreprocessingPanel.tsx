import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { createPreprocessingAdapter } from './PreprocessingAdapter';
import { buildDatasetContinuityPrompt } from './continuityPrompt';
import { DatasetChooserDialog, RenameTabDialog } from './PreprocessingDialogs';
import {
  PreprocessingToolbarLeft,
  PreprocessingToolbarRight
} from './PreprocessingToolbar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { sanitizeAssistantText } from '@/lib/llm/sanitizeAssistantText';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses } from '@/types/project';
import type { TransformationEvent } from '@/types/preprocessing';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Wand2
} from 'lucide-react';
import { DatasetContinuityDialog } from './DatasetContinuityDialog';
import { TransformationTimeline } from './TransformationTimeline';
import { usePreprocessingTabs } from './hooks/usePreprocessingTabs';
import { DEFAULT_TAB_ID, getRowCountSummary, summarizeValidation } from './preprocessingTabUtils';

const STATUS_LABELS: Record<TransformationEvent['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  awaiting_approval: 'Awaiting approval',
  applied: 'Applied',
  failed: 'Failed',
  diverged: 'Diverged'
};

const HIDDEN_ACTIVITY_TOOLS = new Set([
  'set_active_dataset',
  'list_project_datasets',
  'profile_active_dataset'
]);

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

  const [isDatasetModalOpen, setDatasetModalOpen] = useState(false);
  const [datasetSearch, setDatasetSearch] = useState('');
  const [candidateDatasetId, setCandidateDatasetId] = useState<string | null>(null);
  const [isSubmitChoiceOpen, setSubmitChoiceOpen] = useState(false);
  const [pendingSubmitPrompt, setPendingSubmitPrompt] = useState('');

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
    onNeedsDatasetSelection: useCallback((firstDatasetId: string) => {
      setCandidateDatasetId(firstDatasetId);
      setDatasetModalOpen(true);
    }, [])
  });

  useEffect(() => {
    if (projectId) {
      void loadTables(projectId);
    }
  }, [projectId, loadTables]);

  useEffect(() => {
    if (!selectedDatasetId && tables.length > 0) {
      setDatasetModalOpen(true);
      const candidateStillExists = candidateDatasetId
        ? tables.some((table) => table.datasetId === candidateDatasetId)
        : false;
      if (!candidateStillExists) {
        setCandidateDatasetId(tables[0].datasetId);
      }
    }
  }, [candidateDatasetId, selectedDatasetId, tables]);

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
      setDatasetModalOpen(true);
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

  const filteredTables = useMemo(() => {
    const query = datasetSearch.trim().toLowerCase();
    if (!query) return tables;
    return tables.filter((table) => {
      return table.filename.toLowerCase().includes(query)
        || table.name.toLowerCase().includes(query)
        || table.datasetId.toLowerCase().includes(query);
    });
  }, [datasetSearch, tables]);

  const sortedTimeline = useMemo(
    () => [...timeline].sort((a, b) => a.createdAt - b.createdAt),
    [timeline]
  );
  const latestTimelineEvent = useMemo(
    () => [...timeline].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null,
    [timeline]
  );
  const composerStatusNotice = useMemo(() => {
    if (!storeError && !latestTimelineEvent) {
      return null;
    }

    if (storeError) {
      return (
        <Card className="border-red-300 bg-red-50/80">
          <CardContent className="flex items-center gap-2 p-2 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Latest error:</span>
            <span>{storeError}</span>
          </CardContent>
        </Card>
      );
    }

    if (!latestTimelineEvent) {
      return null;
    }

    const status = latestTimelineEvent.status;
    const rowCountSummary = getRowCountSummary(latestTimelineEvent);
    const hasRowCountSummary = Boolean(
      rowCountSummary && !latestTimelineEvent.error && !latestTimelineEvent.decisionReason
    );
    const baseClass = status === 'failed'
      ? 'border-red-300 bg-red-50/80 text-red-700'
      : status === 'awaiting_approval'
        ? 'border-amber-300 bg-amber-50/80 text-amber-700'
        : status === 'diverged'
          ? divergedAccentClassName
          : status === 'applied'
            ? 'border-emerald-300 bg-emerald-50/80 text-emerald-700'
            : 'border-sky-300 bg-sky-50/80 text-sky-700';
    const detail = latestTimelineEvent.error
      ?? latestTimelineEvent.decisionReason
      ?? summarizeValidation(latestTimelineEvent)
      ?? (status === 'awaiting_approval' ? 'Waiting for your approve/reject decision.' : undefined);

    return (
      <Card className={baseClass}>
        <CardContent className="flex items-center gap-2 p-2 text-xs">
          {status === 'failed' ? (
            <AlertTriangle className="h-4 w-4" />
          ) : status === 'awaiting_approval' ? (
            <ShieldAlert className="h-4 w-4" />
          ) : status === 'applied' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{latestTimelineEvent.title}</span>
          <Badge
            variant="outline"
            className="h-5 border-current/30 bg-background/20 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-current"
          >
            {STATUS_LABELS[status]}
          </Badge>
          {hasRowCountSummary && rowCountSummary ? (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] opacity-95">
              <span className="opacity-80">Rows</span>
              <span className="inline-flex h-5 items-center rounded border border-current/30 bg-background/20 px-1.5 font-medium tabular-nums">
                {rowCountSummary.before}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span className="inline-flex h-5 items-center rounded border border-current/30 bg-background/20 px-1.5 font-medium tabular-nums">
                {rowCountSummary.after}
              </span>
              {rowCountSummary.schemaDrift ? (
                <Badge variant="outline" className="h-5 border-current/30 bg-background/20 px-1.5 text-[10px] text-current">
                  Schema drift
                </Badge>
              ) : null}
            </span>
          ) : null}
          {!hasRowCountSummary && detail ? <span className="text-[11px] opacity-90">{detail}</span> : null}
        </CardContent>
      </Card>
    );
  }, [divergedAccentClassName, latestTimelineEvent, storeError]);

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

  const handleDatasetStart = () => {
    if (!candidateDatasetId) return;
    selectDataset(candidateDatasetId);
    setDatasetModalOpen(false);
  };

  const handleDatasetSelect = (datasetId: string) => {
    selectDataset(datasetId);
    clearRun();
    setCandidateDatasetId(datasetId);
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
        composerStatusSlot={composerStatusNotice}
        LeftPaneComponent={({
          messages,
          isGenerating,
          error: shellError,
          activeTextMessageId,
          activeThinkingMessageId,
          hydratedMessageIds
        }) => {
          const visibleActivityMessages = messages.filter((message) => (
            message.type !== 'tool_call' || !HIDDEN_ACTIVITY_TOOLS.has(message.call.tool)
          ));

          return (
            <div className="mx-auto w-full max-w-5xl space-y-4 p-6 pb-28">
              {storeError || shellError ? (
                <Card className="border-red-300 bg-red-50/80">
                  <CardContent className="flex items-center gap-2 p-3 text-sm text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    {storeError || shellError}
                  </CardContent>
                </Card>
              ) : null}

              {visibleActivityMessages.length > 0 ? (
                <div className="space-y-2 mt-6">
                  <h2 className="text-sm font-semibold">Agent Activity</h2>
                  {visibleActivityMessages.map((message) => {
                    if (message.type === 'user') {
                      return (
                        <div key={message.id} className="flex flex-col items-end">
                          <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                            {message.content}
                          </div>
                        </div>
                      );
                    }

                    if (message.type === 'assistant_text') {
                      const cleaned = sanitizeAssistantText(message.content);
                      if (!cleaned) return null;
                      return (
                        <div key={message.id} className="flex items-start gap-3 w-full">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                            <Wand2 className="h-3 w-3 text-emerald-600" />
                          </div>
                          <ProgressiveMessageText
                            messageId={message.id}
                            text={cleaned}
                            isLive={activeTextMessageId === message.id}
                            mode="markdown"
                            animateOnMount={!hydratedMessageIds.has(message.id)}
                            className="llm-assistant-markdown prose prose-sm dark:prose-invert mt-0.5 max-w-none text-foreground break-words prose-p:leading-relaxed prose-pre:p-0"
                          />
                        </div>
                      );
                    }

                    if (message.type === 'thinking') {
                      return (
                        <ThinkingBlock
                          key={message.id}
                          messageId={message.id}
                          content={message.content}
                          isComplete={message.isComplete}
                          isLive={activeThinkingMessageId === message.id}
                          animateOnMount={!hydratedMessageIds.has(message.id)}
                        />
                      );
                    }

                    if (message.type === 'tool_call') {
                      return (
                        <ToolIndicator
                          key={message.id}
                          toolCalls={[message.call]}
                          results={message.result ? [message.result] : []}
                          isRunning={!message.result}
                          autoExpandPreviewTools
                        />
                      );
                    }

                    return null;
                  })}
                </div>
              ) : null}

              <TransformationTimeline
                sortedTimeline={sortedTimeline}
                replayReport={replayReport}
                divergedAccentClassName={divergedAccentClassName}
                projectAccentBorderClass={projectAccentClasses.border}
                isGenerating={isGenerating}
                onApproveStep={handleApproveStep}
                onRejectStep={handleRejectStep}
              />
            </div>
          );
        }}
      />

      <DatasetChooserDialog
        open={isDatasetModalOpen}
        onOpenChange={setDatasetModalOpen}
        datasetSearch={datasetSearch}
        onDatasetSearchChange={setDatasetSearch}
        allTables={tables}
        filteredTables={filteredTables}
        candidateDatasetId={candidateDatasetId}
        onCandidateDatasetChange={setCandidateDatasetId}
        onStart={handleDatasetStart}
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
