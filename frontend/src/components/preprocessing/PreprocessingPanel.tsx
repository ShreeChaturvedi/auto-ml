import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { createPreprocessingAdapter } from './PreprocessingAdapter';
import { buildDatasetContinuityPrompt } from './continuityPrompt';
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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useNotebookStore } from '@/stores/notebookStore';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import type { ReplayCompatibilityReport } from '@/stores/preprocessingStore';
import type { StepCellBinding, TransformationEvent } from '@/types/preprocessing';
import {
  buildProcessingStorageKey,
  buildProcessingTabsStateKey,
  discoverProcessingTabIds,
  extractRunIdFromStoredMessages,
  parseStoredPreprocessingTabsState
} from './storagePersistence';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  GitBranch,
  Loader2,
  Plus,
  PlayCircle,
  RotateCcw,
  RefreshCw,
  ShieldAlert,
  Wand2,
  WandSparkles,
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

const TAB_ACTION_NEW = '__new_processing_tab__';
const TAB_ACTION_DELETE = '__delete_processing_tab__';
const DEFAULT_TAB_ID = 'processing-tab-1';

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

function createDefaultTab(): PreprocessingTab {
  return {
    id: DEFAULT_TAB_ID,
    name: 'Processing 1',
    snapshot: createEmptyTabSnapshot(),
    storageVersion: 0
  };
}

function createTabId(): string {
  return `proc-${Math.random().toString(36).slice(2, 10)}`;
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
  const initializeNotebook = useNotebookStore((state) => state.initializeNotebook);
  const disconnectNotebook = useNotebookStore((state) => state.disconnect);
  const notebookCells = useNotebookStore((state) => state.cells);

  const {
    tables,
    selectedDatasetId,
    runId,
    timeline,
    stepBindings,
    replayReport,
    isLoadingTables,
    error: storeError,
    loadTables,
    selectDataset,
    setRunId,
    setNextRunCellMode,
    hydrateRunById,
    approveStep,
    rejectStep,
    syncDivergence,
    evaluateReplayCompatibility,
    clearRun
  } = usePreprocessingStore();
  const lastHydratedRunIdRef = useRef<string | null>(null);
  const submitPromptResolverRef = useRef<((prompt: string | null) => void) | null>(null);
  const suppressStoredRunHydrationRef = useRef(false);
  const hydratedTabsProjectRef = useRef<string | null>(null);

  const [isDatasetModalOpen, setDatasetModalOpen] = useState(false);
  const [datasetSearch, setDatasetSearch] = useState('');
  const [candidateDatasetId, setCandidateDatasetId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<PreprocessingTab[]>([createDefaultTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB_ID);
  const [tabsReady, setTabsReady] = useState(false);
  const [isSubmitChoiceOpen, setSubmitChoiceOpen] = useState(false);
  const [pendingSubmitPrompt, setPendingSubmitPrompt] = useState('');
  const [pendingDecision, setPendingDecision] = useState<{
    stepId: string;
    action: 'approve' | 'reject';
  } | null>(null);
  const [latestDecision, setLatestDecision] = useState<{
    stepId: string;
    action: 'approved' | 'rejected';
    at: number;
  } | null>(null);

  useEffect(() => {
    if (projectId) {
      void loadTables(projectId);
    }
  }, [projectId, loadTables]);

  useEffect(() => {
    if (!projectId) return;
    void initializeNotebook(projectId);
    return () => disconnectNotebook();
  }, [disconnectNotebook, initializeNotebook, projectId]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    if (hydratedTabsProjectRef.current === projectId) {
      return;
    }

    setTabsReady(false);
    hydratedTabsProjectRef.current = projectId;
    const defaultTab = createDefaultTab();
    const persistedTabsState = parseStoredPreprocessingTabsState(
      localStorage.getItem(buildProcessingTabsStateKey(projectId))
    );

    const recoveredTabs: PreprocessingTab[] = [];
    const knownTabIds = new Set<string>();
    const appendRecoveredTab = (id: string, name: string, storageVersion: number) => {
      if (knownTabIds.has(id)) {
        return;
      }
      knownTabIds.add(id);
      const storageKey = `${buildProcessingStorageKey(id)}-${projectId}`;
      const inferredRunId = extractRunIdFromStoredMessages(localStorage.getItem(storageKey));
      recoveredTabs.push({
        id,
        name,
        storageVersion,
        snapshot: {
          ...createEmptyTabSnapshot(),
          runId: inferredRunId
        }
      });
    };

    persistedTabsState?.tabs.forEach((tab) => {
      appendRecoveredTab(tab.id, tab.name, tab.storageVersion);
    });

    discoverProcessingTabIds(projectId).forEach((tabId) => {
      appendRecoveredTab(tabId, `Processing ${recoveredTabs.length + 1}`, 0);
    });

    if (recoveredTabs.length === 0) {
      recoveredTabs.push(defaultTab);
    }

    const persistedActiveTabId = persistedTabsState?.activeTabId ?? recoveredTabs[0].id;
    const recoveredActiveTabId = recoveredTabs.some((tab) => tab.id === persistedActiveTabId)
      ? persistedActiveTabId
      : recoveredTabs[0].id;
    const activeRecoveredTab = recoveredTabs.find((tab) => tab.id === recoveredActiveTabId) ?? recoveredTabs[0];

    setTabs(recoveredTabs);
    setActiveTabId(recoveredActiveTabId);
    usePreprocessingStore.setState({
      selectedDatasetId: activeRecoveredTab.snapshot.selectedDatasetId,
      runId: activeRecoveredTab.snapshot.runId,
      timeline: activeRecoveredTab.snapshot.timeline,
      stepBindings: activeRecoveredTab.snapshot.stepBindings,
      replayReport: activeRecoveredTab.snapshot.replayReport,
      error: null
    });
    setTabsReady(true);
  }, [projectId]);

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
    void syncDivergence(notebookCells);
  }, [notebookCells, syncDivergence]);

  useEffect(() => {
    if (tabs.length === 0) {
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (!tabsReady || !projectId || tabs.length === 0) {
      return;
    }
    const persistedActiveTabId = tabs.some((tab) => tab.id === activeTabId)
      ? activeTabId
      : tabs[0].id;
    localStorage.setItem(
      buildProcessingTabsStateKey(projectId),
      JSON.stringify({
        activeTabId: persistedActiveTabId,
        tabs: tabs.map((tab) => ({
          id: tab.id,
          name: tab.name,
          storageVersion: tab.storageVersion
        }))
      })
    );
  }, [activeTabId, projectId, tabs, tabsReady]);

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

  useEffect(() => {
    if (!projectId || runId || !activeTab) {
      return;
    }
    if (suppressStoredRunHydrationRef.current) {
      return;
    }
    const storageKey = `${buildProcessingStorageKey(activeTab.id)}-${projectId}`;
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

  const handleTabSelect = (value: string) => {
    if (!activeTab) return;

    if (value === TAB_ACTION_NEW) {
      const nextIndex = tabs.length + 1;
      const newTab: PreprocessingTab = {
        id: createTabId(),
        name: `Processing ${nextIndex}`,
        snapshot: createEmptyTabSnapshot(),
        storageVersion: 0
      };
      setTabs((previous) => previous.map((tab) => (
        tab.id === activeTab.id
          ? {
              ...tab,
              snapshot: {
                selectedDatasetId,
                runId,
                timeline,
                stepBindings,
                replayReport
              }
            }
          : tab
      )).concat(newTab));
      setActiveTabId(newTab.id);
      applyTabSnapshot(newTab.snapshot);
      return;
    }

    if (value === TAB_ACTION_DELETE) {
      if (tabs.length <= 1) {
        return;
      }
      const targetIndex = tabs.findIndex((tab) => tab.id === activeTab.id);
      const fallbackTab = tabs[targetIndex - 1] ?? tabs[targetIndex + 1];
      if (!fallbackTab) {
        return;
      }

      if (projectId) {
        const currentStorageKey = buildProcessingStorageKey(activeTab.id);
        localStorage.removeItem(`${currentStorageKey}-${projectId}`);
      }

      setTabs((previous) => previous.filter((tab) => tab.id !== activeTab.id));
      setActiveTabId(fallbackTab.id);
      applyTabSnapshot(fallbackTab.snapshot);
      return;
    }

    const targetTab = tabs.find((tab) => tab.id === value);
    if (!targetTab || targetTab.id === activeTab.id) {
      return;
    }

    setTabs((previous) => previous.map((tab) => (
      tab.id === activeTab.id
        ? {
            ...tab,
            snapshot: {
              selectedDatasetId,
              runId,
              timeline,
              stepBindings,
              replayReport
            }
          }
        : tab
    )));

    setActiveTabId(targetTab.id);
    applyTabSnapshot(targetTab.snapshot);
  };

  const resetActiveTab = () => {
    if (!activeTab) return;

    if (projectId) {
      const currentStorageKey = buildProcessingStorageKey(activeTab.id);
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
          activeTab?.id ?? 'processing-tab-1'
        )}
        toolbarLeft={
          <>
            <WandSparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Agentic Preprocessing</span>
            <Select value={activeTab?.id ?? ''} onValueChange={handleTabSelect}>
              <SelectTrigger className="h-8 w-[190px]">
                <SelectValue placeholder="Processing tab" />
              </SelectTrigger>
              <SelectContent>
                {tabs.map((tab) => (
                  <SelectItem key={tab.id} value={tab.id}>
                    {tab.name}
                  </SelectItem>
                ))}
                <SelectItem value={TAB_ACTION_NEW}>+ New Processing Tab</SelectItem>
                <SelectItem value={TAB_ACTION_DELETE} disabled={tabs.length <= 1}>
                  Delete Current Tab
                </SelectItem>
              </SelectContent>
            </Select>
            {runId ? (
              <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
                Run {runId.slice(0, 10)}
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="h-6 px-2 text-[11px] font-normal"
              title="Hybrid mode: steps chain inside the active run; switching dataset or resetting tab starts a fresh run."
            >
              Mode: Hybrid
            </Badge>
          </>
        }
        toolbarRight={
          <>
            <Select
              value={selectedDatasetId ?? ''}
              onValueChange={handleDatasetSelect}
              disabled={isLoadingTables || tables.length === 0}
            >
              <SelectTrigger className="h-9 w-[320px]">
                <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Select dataset" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table.datasetId} value={table.datasetId}>
                    {table.filename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (projectId) {
                  void evaluateReplayCompatibility(projectId);
                }
              }}
              disabled={!selectedDatasetId || !projectId}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Replay Check
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={resetActiveTab}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Tab
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTabSelect(TAB_ACTION_NEW)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Tab
            </Button>
          </>
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
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pendingDecision?.stepId === event.stepId}
                                onClick={async () => {
                                  if (!projectId) {
                                    return;
                                  }
                                  setPendingDecision({ stepId: event.stepId, action: 'reject' });
                                  try {
                                    await rejectStep(projectId, event.stepId, 'Rejected by user');
                                    setLatestDecision({
                                      stepId: event.stepId,
                                      action: 'rejected',
                                      at: Date.now()
                                    });
                                  } finally {
                                    setPendingDecision((current) => (
                                      current?.stepId === event.stepId ? null : current
                                    ));
                                  }
                                }}
                              >
                                {pendingDecision?.stepId === event.stepId && pendingDecision.action === 'reject' ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <XCircle className="mr-1 h-3.5 w-3.5" />
                                )}
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                disabled={pendingDecision?.stepId === event.stepId}
                                onClick={async () => {
                                  if (!projectId) {
                                    return;
                                  }
                                  setPendingDecision({ stepId: event.stepId, action: 'approve' });
                                  try {
                                    await approveStep(projectId, event.stepId);
                                    setLatestDecision({
                                      stepId: event.stepId,
                                      action: 'approved',
                                      at: Date.now()
                                    });
                                  } finally {
                                    setPendingDecision((current) => (
                                      current?.stepId === event.stepId ? null : current
                                    ));
                                  }
                                }}
                              >
                                {pendingDecision?.stepId === event.stepId && pendingDecision.action === 'approve' ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                )}
                                Approve
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {latestDecision?.stepId === event.stepId ? (
                          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-emerald-700">
                            {latestDecision.action === 'approved'
                              ? 'Approval synced to backend run state.'
                              : 'Rejection synced to backend run state.'}
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
                  <p className="text-[11px] text-muted-foreground">
                    {replayReport.source === 'backend_authoritative'
                      ? 'Backend-authoritative result'
                      : 'Local pre-check (non-authoritative)'}
                  </p>
                  {!replayReport.compatible ? (
                    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {replayReport.issues.map((issue, index) => (
                        <li key={`${issue}-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No replay blockers detected against current dataset schema.</p>
                  )}
                  {replayReport.source === 'backend_authoritative' && (replayReport.precheckIssues?.length ?? 0) > 0 ? (
                    <div className="rounded-md border bg-muted/20 p-2">
                      <p className="text-[11px] font-medium">Local pre-check warnings (informational)</p>
                      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                        {replayReport.precheckIssues?.map((issue, index) => (
                          <li key={`${issue}-${index}`}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
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

      <Dialog open={isDatasetModalOpen} onOpenChange={setDatasetModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select a dataset to start preprocessing</DialogTitle>
            <DialogDescription>
              Pick the exact dataset context for this run. We avoid implicit defaults to keep lineage deterministic.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={datasetSearch}
              onChange={(event) => setDatasetSearch(event.target.value)}
              placeholder="Search datasets by filename or id..."
            />

            <ScrollArea className="h-64 rounded-md border">
              <div className="space-y-2 p-2">
                {filteredTables.map((table) => {
                  const selected = candidateDatasetId === table.datasetId;
                  const previewRows = table.previewRows ?? [];
                  const previewColumns = Object.keys(previewRows[0] ?? {}).slice(0, 4);
                  return (
                    <button
                      type="button"
                      key={table.datasetId}
                      onClick={() => setCandidateDatasetId(table.datasetId)}
                      className={cn(
                        'w-full rounded-md border p-3 text-left transition-colors',
                        selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{table.filename}</p>
                        <Badge variant="outline" className="text-[10px]">{table.nRows ?? 0} x {table.nCols ?? 0}</Badge>
                      </div>
                      {table.columns?.length ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          Columns: {table.columns.slice(0, 4).map((column) => column.name).join(', ')}
                        </p>
                      ) : null}
                      {previewRows.length > 0 ? (
                        <div className="mt-2 overflow-x-auto rounded-md border bg-background/70">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="border-b border-border/40 text-muted-foreground">
                                {previewColumns.map((columnName) => (
                                  <th key={columnName} className="px-2 py-1 text-left font-medium">
                                    {columnName}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewRows.slice(0, 3).map((previewRow, rowIndex) => (
                                <tr key={rowIndex} className="border-b border-border/20 last:border-0">
                                  {previewColumns.map((columnName) => (
                                    <td key={`${rowIndex}-${columnName}`} className="px-2 py-1 font-mono text-muted-foreground">
                                      {previewRow[columnName] == null ? 'null' : String(previewRow[columnName])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </button>
                  );
                })}

                {filteredTables.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                    No datasets match your search.
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDatasetModalOpen(false)}>Cancel</Button>
            <Button onClick={handleDatasetStart} disabled={!candidateDatasetId}>
              Start with this dataset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              For this prompt, should preprocessing continue from the current edited working dataset, or restart from the original dataset source?
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
