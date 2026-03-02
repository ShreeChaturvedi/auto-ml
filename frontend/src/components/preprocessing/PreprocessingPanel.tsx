import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { createPreprocessingAdapter } from './PreprocessingAdapter';
import { buildDatasetContinuityPrompt } from './continuityPrompt';
import { DatasetChooserDialog, RenameTabDialog } from './PreprocessingDialogs';
import {
  PreprocessingToolbarLeft,
  PreprocessingToolbarRight
} from './PreprocessingToolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useNotebookStore } from '@/stores/notebookStore';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import type { ReplayCompatibilityReport } from '@/stores/preprocessingStore';
import type { StepCellBinding, TransformationEvent } from '@/types/preprocessing';
import { extractRunIdFromStoredMessages } from './storagePersistence';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  GitBranch,
  Loader2,
  PlayCircle,
  ShieldAlert,
  Wand2,
  XCircle
} from 'lucide-react';

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


interface PreprocessingTabSnapshot {
  selectedDatasetId: string | null;
  runId: string | null;
  timeline: TransformationEvent[];
  stepBindings: Record<string, StepCellBinding>;
  replayReport: ReplayCompatibilityReport | null;
}

interface PreprocessingTab {
  id: string;
  name: string;
  snapshot: PreprocessingTabSnapshot;
  storageVersion: number;
}

function createEmptyTabSnapshot(): PreprocessingTabSnapshot {
  return {
    selectedDatasetId: null,
    runId: null,
    timeline: [],
    stepBindings: {},
    replayReport: null
  };
}

function createTabId(): string {
  return `proc-${Math.random().toString(36).slice(2, 10)}`;
}

function buildProcessingStorageKey(tabId: string, storageVersion: number): string {
  return `preprocessing-messages-v5-${tabId}-${storageVersion}`;
}

function statusClassName(status: TransformationEvent['status']): string {
  if (status === 'applied') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-red-300 bg-red-50 text-red-700';
  if (status === 'awaiting_approval') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (status === 'diverged') return 'border-purple-300 bg-purple-50 text-purple-700';
  if (status === 'running') return 'border-sky-300 bg-sky-50 text-sky-700';
  return 'border-muted bg-muted/50 text-muted-foreground';
}

function summarizeValidation(event: TransformationEvent): string | null {
  if (!event.validation) {
    return null;
  }
  const { rowCountBefore, rowCountAfter, schemaDrift, notes } = event.validation;
  if (typeof rowCountBefore === 'number' && typeof rowCountAfter === 'number') {
    return `Rows ${rowCountBefore} -> ${rowCountAfter}${schemaDrift ? ', schema drift flagged' : ''}`;
  }
  if (typeof notes === 'string' && notes.trim()) {
    return notes;
  }
  if (schemaDrift) {
    return 'Validation flagged schema drift.';
  }
  return null;
}

export function PreprocessingPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const notebookCells = useNotebookStore((state) => state.cells);

  const tables = usePreprocessingStore((state) => state.tables);
  const selectedDatasetId = usePreprocessingStore((state) => state.selectedDatasetId);
  const runId = usePreprocessingStore((state) => state.runId);
  const timeline = usePreprocessingStore((state) => state.timeline);
  const stepBindings = usePreprocessingStore((state) => state.stepBindings);
  const replayReport = usePreprocessingStore((state) => state.replayReport);
  const isLoadingTables = usePreprocessingStore((state) => state.isLoadingTables);
  const storeError = usePreprocessingStore((state) => state.error);
  const loadTables = usePreprocessingStore((state) => state.loadTables);
  const selectDataset = usePreprocessingStore((state) => state.selectDataset);
  const setRunId = usePreprocessingStore((state) => state.setRunId);
  const setNextRunCellMode = usePreprocessingStore((state) => state.setNextRunCellMode);
  const hydrateRunById = usePreprocessingStore((state) => state.hydrateRunById);
  const approveStep = usePreprocessingStore((state) => state.approveStep);
  const rejectStep = usePreprocessingStore((state) => state.rejectStep);
  const syncDivergence = usePreprocessingStore((state) => state.syncDivergence);
  const evaluateReplayCompatibility = usePreprocessingStore((state) => state.evaluateReplayCompatibility);
  const clearRun = usePreprocessingStore((state) => state.clearRun);
  const lastHydratedRunIdRef = useRef<string | null>(null);
  const submitPromptResolverRef = useRef<((prompt: string | null) => void) | null>(null);
  const suppressStoredRunHydrationRef = useRef(false);

  const [isDatasetModalOpen, setDatasetModalOpen] = useState(false);
  const [datasetSearch, setDatasetSearch] = useState('');
  const [candidateDatasetId, setCandidateDatasetId] = useState<string | null>(null);
  const [renameTabDialogOpen, setRenameTabDialogOpen] = useState(false);
  const [renameTabName, setRenameTabName] = useState('');
  const [tabs, setTabs] = useState<PreprocessingTab[]>([
    {
      id: 'processing-tab-1',
      name: 'Processing 1',
      snapshot: createEmptyTabSnapshot(),
      storageVersion: 0
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('processing-tab-1');
  const [isSubmitChoiceOpen, setSubmitChoiceOpen] = useState(false);
  const [pendingSubmitPrompt, setPendingSubmitPrompt] = useState('');

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
    syncDivergence(notebookCells);
  }, [notebookCells, syncDivergence]);

  useEffect(() => {
    setTabs((previous) => previous.map((tab) => {
      if (tab.id !== activeTabId) {
        return tab;
      }
      return {
        ...tab,
        snapshot: {
          selectedDatasetId,
          runId,
          timeline,
          stepBindings,
          replayReport
        }
      };
    }));
  }, [activeTabId, replayReport, runId, selectedDatasetId, stepBindings, timeline]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  );

  const selectedTable = useMemo(
    () => tables.find((table) => table.datasetId === selectedDatasetId),
    [tables, selectedDatasetId]
  );

  useEffect(() => {
    if (!projectId || runId || !activeTab) {
      return;
    }
    if (suppressStoredRunHydrationRef.current) {
      return;
    }
    const storageKey = `${buildProcessingStorageKey(activeTab.id, activeTab.storageVersion)}-${projectId}`;
    const inferredRunId = extractRunIdFromStoredMessages(localStorage.getItem(storageKey));
    if (inferredRunId) {
      setRunId(inferredRunId);
    }
  }, [activeTab, projectId, runId, setRunId]);

  useEffect(() => {
    if (runId) {
      suppressStoredRunHydrationRef.current = false;
    }
  }, [runId]);

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
    suppressStoredRunHydrationRef.current = true;
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

  const handleDatasetStart = () => {
    if (!candidateDatasetId) return;
    selectDataset(candidateDatasetId);
    setDatasetModalOpen(false);
  };

  const handleDatasetSelect = (datasetId: string) => {
    selectDataset(datasetId);
    suppressStoredRunHydrationRef.current = true;
    clearRun();
    setCandidateDatasetId(datasetId);
  };

  const applyTabSnapshot = (snapshot: PreprocessingTabSnapshot) => {
    usePreprocessingStore.setState({
      selectedDatasetId: snapshot.selectedDatasetId,
      runId: snapshot.runId,
      timeline: snapshot.timeline,
      stepBindings: snapshot.stepBindings,
      replayReport: snapshot.replayReport,
      error: null
    });
    if (!snapshot.selectedDatasetId && tables.length > 0) {
      setCandidateDatasetId(tables[0].datasetId);
      setDatasetModalOpen(true);
    }
  };

  const saveActiveSnapshot = () => {
    if (!activeTab) return;
    setTabs((previous) => previous.map((tab) => (
      tab.id === activeTab.id
        ? { ...tab, snapshot: { selectedDatasetId, runId, timeline, stepBindings, replayReport } }
        : tab
    )));
  };

  const handleTabSwitch = (value: string) => {
    if (!activeTab) return;
    const targetTab = tabs.find((tab) => tab.id === value);
    if (!targetTab || targetTab.id === activeTab.id) return;
    saveActiveSnapshot();
    setActiveTabId(targetTab.id);
    applyTabSnapshot(targetTab.snapshot);
  };

  const handleNewTab = () => {
    if (!activeTab) return;
    const nextIndex = tabs.length + 1;
    const newTab: PreprocessingTab = {
      id: createTabId(),
      name: `Processing ${nextIndex}`,
      snapshot: createEmptyTabSnapshot(),
      storageVersion: 0
    };
    saveActiveSnapshot();
    setTabs((previous) => [...previous, newTab]);
    setActiveTabId(newTab.id);
    applyTabSnapshot(newTab.snapshot);
  };

  const handleDeleteTab = () => {
    if (!activeTab || tabs.length <= 1) return;
    const targetIndex = tabs.findIndex((tab) => tab.id === activeTab.id);
    const fallbackTab = tabs[targetIndex - 1] ?? tabs[targetIndex + 1];
    if (!fallbackTab) return;
    if (projectId) {
      localStorage.removeItem(`${buildProcessingStorageKey(activeTab.id, activeTab.storageVersion)}-${projectId}`);
    }
    setTabs((previous) => previous.filter((tab) => tab.id !== activeTab.id));
    setActiveTabId(fallbackTab.id);
    applyTabSnapshot(fallbackTab.snapshot);
  };

  const openRenameTabDialog = () => {
    if (!activeTab) return;
    setRenameTabName(activeTab.name);
    setRenameTabDialogOpen(true);
  };

  const handleRenameTab = () => {
    if (!activeTab) return;
    const trimmed = renameTabName.trim();
    if (!trimmed) return;
    setTabs((previous) => previous.map((tab) =>
      tab.id === activeTab.id ? { ...tab, name: trimmed } : tab
    ));
    setRenameTabDialogOpen(false);
  };

  const resetActiveTab = () => {
    if (!activeTab) return;

    if (projectId) {
      const currentStorageKey = buildProcessingStorageKey(activeTab.id, activeTab.storageVersion);
      localStorage.removeItem(`${currentStorageKey}-${projectId}`);
    }

    const nextSnapshot = createEmptyTabSnapshot();
    setTabs((previous) => previous.map((tab) => (
      tab.id === activeTab.id
        ? {
            ...tab,
            snapshot: nextSnapshot,
            storageVersion: tab.storageVersion + 1
          }
        : tab
    )));
    applyTabSnapshot(nextSnapshot);
    setDatasetModalOpen(true);
  };

  const domainAdapter = useMemo(() => {
    return createPreprocessingAdapter(projectId ?? '', selectedDatasetId, tables);
  }, [projectId, selectedDatasetId, tables]);

  return (
    <>
      <AgenticShell
        key={`${activeTab?.id ?? 'processing-tab-1'}-${activeTab?.storageVersion ?? 0}`}
        projectId={projectId ?? ''}
        domainAdapter={domainAdapter}
        beforeSubmit={requestDatasetContinuityChoice}
        storageKey={buildProcessingStorageKey(
          activeTab?.id ?? 'processing-tab-1',
          activeTab?.storageVersion ?? 0
        )}
        toolbarLeft={
          <PreprocessingToolbarLeft
            tabs={tabs.map((tab) => ({ id: tab.id, name: tab.name }))}
            activeTabId={activeTab?.id ?? ''}
            onTabSwitch={handleTabSwitch}
            onNewTab={handleNewTab}
            onRenameTab={openRenameTabDialog}
            onReplayCheck={evaluateReplayCompatibility}
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
        chatMetaSlot={
          <div className="hidden min-w-0 flex-wrap items-center gap-2 sm:flex">
            {selectedTable ? (
              <Badge variant="outline" className="h-6 max-w-[210px] px-2 text-[11px] font-normal">
                <span className="truncate" title={selectedTable.filename}>{selectedTable.filename}</span>
              </Badge>
            ) : null}
            {runId ? (
              <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
                <PlayCircle className="mr-1 h-3.5 w-3.5" />
                Active run
              </Badge>
            ) : null}
          </div>
        }
        LeftPaneComponent={({ messages, isGenerating, error: shellError }) => {
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

            {!selectedDatasetId && !isDatasetModalOpen ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <Database className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">No preprocessing dataset selected</p>
                    <p className="text-xs text-muted-foreground">Open dataset chooser to set explicit context.</p>
                  </div>
                  <Button variant="outline" onClick={() => setDatasetModalOpen(true)}>Open dataset chooser</Button>
                </CardContent>
              </Card>
            ) : null}

            {sortedTimeline.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Transformation Timeline</h2>
                  <p className="text-xs text-muted-foreground">Cards are projected from structured tool events. Notebook remains the execution source of truth.</p>
                </div>
                {sortedTimeline.map((event) => {
                  const validationSummary = summarizeValidation(event);

                  return (
                    <Card key={event.id} className={cn('border', event.status === 'diverged' ? 'border-purple-300' : '')}>
                      <CardHeader className="space-y-2 pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <CardTitle className="text-sm font-semibold">{event.title}</CardTitle>
                            <p className="text-xs text-muted-foreground">{event.toolName} · step {event.stepId.slice(0, 8)}</p>
                          </div>
                          <Badge className={cn('border', statusClassName(event.status))}>{STATUS_LABELS[event.status]}</Badge>
                        </div>
                        {event.rationale ? <p className="text-xs text-muted-foreground">{event.rationale}</p> : null}
                      </CardHeader>

                      <CardContent className="space-y-3 text-xs">
                        {event.code ? (
                          <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                            <p className="font-medium">Execution location</p>
                            <p className="text-muted-foreground">
                              This step's code is executed and inspectable in the notebook pane on the right.
                            </p>
                            {event.codeHash ? (
                              <p className="font-mono text-[10px] text-muted-foreground">
                                code hash: {event.codeHash.slice(0, 12)}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {event.cellIds.length > 0 ? (
                          <div className="rounded-md border bg-muted/20 p-2">
                            <p className="mb-1 font-medium">Notebook bindings</p>
                            <div className="flex flex-wrap gap-1">
                              {event.cellIds.map((cellId) => (
                                <Badge key={cellId} variant="outline" className="h-5 px-2 text-[10px]">
                                  {cellId.slice(0, 8)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {validationSummary ? (
                          <div className="rounded-md border bg-muted/20 p-2">
                            <p className="font-medium">Validation</p>
                            <p className="text-muted-foreground">{validationSummary}</p>
                          </div>
                        ) : null}

                        {event.status === 'awaiting_approval' ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                            <ShieldAlert className="h-4 w-4 text-amber-600" />
                            <span className="text-amber-700">This step requires explicit approval.</span>
                            <div className="ml-auto flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => rejectStep(event.stepId, 'Rejected by user')}>
                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                Reject
                              </Button>
                              <Button size="sm" onClick={() => approveStep(event.stepId)}>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                Approve
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {event.status === 'diverged' ? (
                          <div className="rounded-md border border-purple-300 bg-purple-50 p-2 text-purple-700">
                            Notebook content diverged from the stored step code hash. Edit and re-run to reconcile.
                          </div>
                        ) : null}

                        {event.error ? (
                          <div className="rounded-md border border-red-300 bg-red-50 p-2 text-red-700">
                            {event.error}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
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
                    return (
                      <div key={message.id} className="flex items-start gap-3 w-full">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                          <Wand2 className="h-3 w-3 text-emerald-600" />
                        </div>
                        <div className="prose prose-sm dark:prose-invert mt-0.5 max-w-none text-foreground break-words prose-p:leading-relaxed prose-pre:p-0">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                        </div>
                      </div>
                    );
                  }

                  if (message.type === 'thinking') {
                    return (
                      <ThinkingBlock
                        key={message.id}
                        content={message.content}
                        isComplete={message.isComplete}
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

            {replayReport ? (
              <Card className={cn(replayReport.compatible ? 'border-emerald-300' : 'border-amber-300')}>
                <CardContent className="space-y-2 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <GitBranch className="h-4 w-4" />
                    Replay compatibility {replayReport.compatible ? 'passed' : 'needs attention'}
                  </div>
                  {!replayReport.compatible ? (
                    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {replayReport.issues.map((issue, index) => (
                        <li key={`${issue}-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No replay blockers detected against current dataset schema.</p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {isGenerating ? (
              <div className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Streaming preprocessing graph events...
              </div>
            ) : null}
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

      <Dialog
        open={isSubmitChoiceOpen}
        onOpenChange={(open) => {
          if (!open) {
            resolvePendingSubmitPrompt(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Choose Dataset Source For This Action</DialogTitle>
            <DialogDescription>
              For this prompt, should preprocessing continue from the current edited working dataset,
              or restart from the original dataset source?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Card className="border-muted">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Current selection</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {selectedTable?.filename ?? 'No dataset selected'}
              </CardContent>
            </Card>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={handleUseOriginalDataset}>
                Start From Original
              </Button>
              <Button onClick={handleUseCurrentDataset}>
                Continue Current Working
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => resolvePendingSubmitPrompt(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
