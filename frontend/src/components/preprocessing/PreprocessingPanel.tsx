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
import { sanitizeAssistantText } from '@/lib/llm/sanitizeAssistantText';
import { useNotebookStore } from '@/stores/notebookStore';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useProjectStore } from '@/stores/projectStore';
import type { ReplayCompatibilityReport } from '@/stores/preprocessingStore';
import type { StepCellBinding, TransformationEvent } from '@/types/preprocessing';
import { projectColorClasses } from '@/types/project';
import {
  buildProcessingStorageKey,
  buildProcessingTabsStateKey,
  extractRunIdFromStoredMessages,
  parseStoredPreprocessingTabsState
} from './storagePersistence';
import {
  ArrowRight,
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
const DEFAULT_TAB_ID = 'processing-tab-1';
const ROW_COUNT_FORMATTER = new Intl.NumberFormat('en-US');


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
  notebookId: string | null;
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

function createDefaultTab(): PreprocessingTab {
  return {
    id: DEFAULT_TAB_ID,
    name: 'Processing 1',
    notebookId: null,
    snapshot: createEmptyTabSnapshot(),
    storageVersion: 0
  };
}

function parseProcessingIndex(name: string): number | null {
  const match = /^Processing\s+(\d+)$/i.exec(name.trim());
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function nextProcessingTabName(tabs: PreprocessingTab[]): string {
  const used = new Set<number>();
  tabs.forEach((tab) => {
    const index = parseProcessingIndex(tab.name);
    if (index) {
      used.add(index);
    }
  });
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return `Processing ${candidate}`;
}

function normalizeProcessingTabNames(tabs: PreprocessingTab[]): PreprocessingTab[] {
  const used = new Set<number>();
  return tabs.map((tab) => {
    const parsed = parseProcessingIndex(tab.name);
    if (!parsed || !used.has(parsed)) {
      if (parsed) {
        used.add(parsed);
      }
      return tab;
    }
    let candidate = 1;
    while (used.has(candidate)) {
      candidate += 1;
    }
    used.add(candidate);
    return {
      ...tab,
      name: `Processing ${candidate}`
    };
  });
}

function statusClassName(status: TransformationEvent['status'], divergedClassName: string): string {
  if (status === 'applied') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-red-300 bg-red-50 text-red-700';
  if (status === 'awaiting_approval') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (status === 'diverged') return divergedClassName;
  if (status === 'running') return 'border-sky-300 bg-sky-50 text-sky-700';
  return 'border-muted bg-muted/50 text-muted-foreground';
}

function getRowCountSummary(event: TransformationEvent): {
  before: string;
  after: string;
  schemaDrift: boolean;
} | null {
  const validation = event.validation;
  if (!validation) {
    return null;
  }
  if (typeof validation.rowCountBefore !== 'number' || typeof validation.rowCountAfter !== 'number') {
    return null;
  }
  return {
    before: ROW_COUNT_FORMATTER.format(validation.rowCountBefore),
    after: ROW_COUNT_FORMATTER.format(validation.rowCountAfter),
    schemaDrift: Boolean(validation.schemaDrift)
  };
}

function summarizeValidation(event: TransformationEvent): string | null {
  if (!event.validation) {
    return null;
  }
  const { schemaDrift, notes } = event.validation;
  if (typeof notes === 'string' && notes.trim()) {
    return notes;
  }
  if (schemaDrift) {
    return 'Schema drift flagged.';
  }
  return null;
}

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
  const notebookCells = useNotebookStore((state) => state.cells);
  const activeNotebookId = useNotebookStore((state) => state.activeNotebookId);
  const notebookProjectId = useNotebookStore((state) => state.currentProjectId);
  const createNotebook = useNotebookStore((state) => state.createNotebook);
  const loadNotebooksInStore = useNotebookStore((state) => state.loadNotebooks);
  const renameNotebook = useNotebookStore((state) => state.renameNotebook);
  const setActiveNotebook = useNotebookStore((state) => state.setActiveNotebook);
  const deleteNotebook = useNotebookStore((state) => state.deleteNotebook);

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
  const hydratedTabsProjectRef = useRef<string | null>(null);

  const [isDatasetModalOpen, setDatasetModalOpen] = useState(false);
  const [datasetSearch, setDatasetSearch] = useState('');
  const [candidateDatasetId, setCandidateDatasetId] = useState<string | null>(null);
  const [renameTabDialogOpen, setRenameTabDialogOpen] = useState(false);
  const [renameTabName, setRenameTabName] = useState('');
  const [tabs, setTabs] = useState<PreprocessingTab[]>([createDefaultTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB_ID);
  const [tabsReady, setTabsReady] = useState(false);
  const [isSubmitChoiceOpen, setSubmitChoiceOpen] = useState(false);
  const [pendingSubmitPrompt, setPendingSubmitPrompt] = useState('');
  const tabsRef = useRef<PreprocessingTab[]>([]);
  const activeTabIdRef = useRef<string>(DEFAULT_TAB_ID);
  const notebookEnsureLocksRef = useRef(new Map<string, Promise<string | null>>());
  const notebookReconcileLockRef = useRef<Promise<void> | null>(null);

  const buildTabStorageKey = useCallback((tabId: string): string => (
    buildProcessingStorageKey(tabId)
  ), []);

  const buildScopedTabStorageKey = useCallback((tabId: string): string => (
    projectId
      ? `${buildTabStorageKey(tabId)}-${projectId}`
      : buildTabStorageKey(tabId)
  ), [buildTabStorageKey, projectId]);

  useEffect(() => {
    if (projectId) {
      void loadTables(projectId);
    }
  }, [projectId, loadTables]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    if (hydratedTabsProjectRef.current === projectId) {
      return;
    }

    setTabsReady(false);
    hydratedTabsProjectRef.current = projectId;

    const persistedTabsState = parseStoredPreprocessingTabsState(
      localStorage.getItem(buildProcessingTabsStateKey(projectId))
    );

    const recoveredTabs: PreprocessingTab[] = [];
    const knownTabIds = new Set<string>();

    const appendRecoveredTab = (
      id: string,
      name: string,
      storageVersion: number,
      notebookId: string | null
    ) => {
      if (knownTabIds.has(id)) {
        return;
      }
      knownTabIds.add(id);
      const storageKey = buildScopedTabStorageKey(id);
      const inferredRunId = extractRunIdFromStoredMessages(localStorage.getItem(storageKey));
      recoveredTabs.push({
        id,
        name,
        notebookId,
        storageVersion,
        snapshot: {
          ...createEmptyTabSnapshot(),
          runId: inferredRunId
        }
      });
    };

    persistedTabsState?.tabs.forEach((tab) => {
      appendRecoveredTab(tab.id, tab.name, tab.storageVersion, tab.notebookId);
    });

    if (recoveredTabs.length === 0) {
      recoveredTabs.push(createDefaultTab());
    }
    const normalizedRecoveredTabs = normalizeProcessingTabNames(recoveredTabs);

    const persistedActiveTabId = persistedTabsState?.activeTabId ?? normalizedRecoveredTabs[0].id;
    const recoveredActiveTabId = normalizedRecoveredTabs.some((tab) => tab.id === persistedActiveTabId)
      ? persistedActiveTabId
      : normalizedRecoveredTabs[0].id;
    const activeRecoveredTab = normalizedRecoveredTabs.find((tab) => tab.id === recoveredActiveTabId) ?? normalizedRecoveredTabs[0];

    setTabs(normalizedRecoveredTabs);
    tabsRef.current = normalizedRecoveredTabs;
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
  }, [buildScopedTabStorageKey, projectId]);

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
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

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
          storageVersion: tab.storageVersion,
          notebookId: tab.notebookId
        }))
      })
    );
  }, [activeTabId, projectId, tabs, tabsReady]);

  useEffect(() => {
    setTabs((previous) => {
      const nextTabs = previous.map((tab) => {
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
      });
      tabsRef.current = nextTabs;
      return nextTabs;
    });
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
    const storageKey = buildScopedTabStorageKey(activeTab.id);
    const inferredRunId = extractRunIdFromStoredMessages(localStorage.getItem(storageKey));
    if (inferredRunId) {
      setRunId(inferredRunId);
    }
  }, [activeTab, buildScopedTabStorageKey, projectId, runId, setRunId]);

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

  const handleApproveStep = (stepId: string) => {
    if (!projectId) {
      return;
    }
    void approveStep(projectId, stepId);
  };

  const handleRejectStep = (stepId: string) => {
    if (!projectId) {
      return;
    }
    void rejectStep(projectId, stepId, 'Rejected by user');
  };

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

  const setTabNotebookId = useCallback((tabId: string, notebookId: string | null) => {
    tabsRef.current = tabsRef.current.map((tab) => (
      tab.id === tabId
        ? { ...tab, notebookId }
        : tab
    ));
    setTabs((previous) => {
      const nextTabs = previous.map((tab) => (
        tab.id === tabId
          ? { ...tab, notebookId }
          : tab
      ));
      tabsRef.current = nextTabs;
      return nextTabs;
    });
  }, []);

  const reconcileTabNotebookMappings = useCallback(async (): Promise<void> => {
    if (!projectId || !tabsReady) {
      return;
    }
    if (useNotebookStore.getState().currentProjectId !== projectId) {
      return;
    }

    const existingLock = notebookReconcileLockRef.current;
    if (existingLock) {
      await existingLock;
      return;
    }

    const reconcilePromise = (async () => {
      await loadNotebooksInStore();
      let notebooks = useNotebookStore.getState().notebooks;
      let notebookIds = new Set(notebooks.map((entry) => entry.notebookId));
      let nextTabs = tabsRef.current.map((tab) => ({ ...tab }));
      let tabsChanged = false;

      // 1) Clear stale notebook bindings that no longer exist.
      nextTabs = nextTabs.map((tab) => {
        if (tab.notebookId && !notebookIds.has(tab.notebookId)) {
          tabsChanged = true;
          return { ...tab, notebookId: null };
        }
        return tab;
      });

      // 2) Ensure every tab has exactly one notebook, reusing unassigned notebooks first.
      const mappedNotebookIds = new Set(
        nextTabs
          .map((tab) => tab.notebookId)
          .filter((value): value is string => Boolean(value))
      );
      const unassignedNotebooks = notebooks.filter((entry) => !mappedNotebookIds.has(entry.notebookId));

      for (const tab of nextTabs) {
        if (tab.notebookId) {
          continue;
        }

        let assignedNotebookId: string | null = null;
        const adopted = unassignedNotebooks.shift();
        if (adopted) {
          assignedNotebookId = adopted.notebookId;
          if (adopted.name !== tab.name) {
            await renameNotebook(adopted.notebookId, tab.name);
          }
        } else {
          const created = await createNotebook(tab.name);
          assignedNotebookId = created?.notebookId ?? null;
          if (assignedNotebookId) {
            await loadNotebooksInStore();
            notebooks = useNotebookStore.getState().notebooks;
            notebookIds = new Set(notebooks.map((entry) => entry.notebookId));
          }
        }

        if (assignedNotebookId) {
          tab.notebookId = assignedNotebookId;
          mappedNotebookIds.add(assignedNotebookId);
          tabsChanged = true;
        }
      }

      if (tabsChanged) {
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
      }

      // 3) Delete orphan notebooks (not referenced by any existing processing tab).
      await loadNotebooksInStore();
      notebooks = useNotebookStore.getState().notebooks;
      const finalMappedNotebookIds = new Set(
        tabsRef.current
          .map((tab) => tab.notebookId)
          .filter((value): value is string => Boolean(value))
      );
      for (const notebook of notebooks) {
        if (finalMappedNotebookIds.has(notebook.notebookId)) {
          continue;
        }
        await deleteNotebook(notebook.notebookId);
      }

      // 4) Keep active tab and notebook view aligned.
      const latestTabs = tabsRef.current;
      const activeTab = latestTabs.find((tab) => tab.id === activeTabIdRef.current) ?? latestTabs[0];
      if (activeTab?.notebookId) {
        await setActiveNotebook(activeTab.notebookId);
      }
    })();

    notebookReconcileLockRef.current = reconcilePromise;
    try {
      await reconcilePromise;
    } finally {
      notebookReconcileLockRef.current = null;
    }
  }, [
    createNotebook,
    deleteNotebook,
    loadNotebooksInStore,
    projectId,
    renameNotebook,
    setActiveNotebook,
    tabsReady
  ]);

  const ensureNotebookForTab = useCallback(async (
    tab: PreprocessingTab,
    options?: { forceCreate?: boolean }
  ): Promise<string | null> => {
    const forceCreate = options?.forceCreate === true;
    const currentTab = tabsRef.current.find((entry) => entry.id === tab.id) ?? tab;

    const existingLock = notebookEnsureLocksRef.current.get(currentTab.id);
    if (existingLock) {
      return existingLock;
    }

    const ensurePromise = (async () => {
      const tabState = tabsRef.current.find((entry) => entry.id === currentTab.id) ?? currentTab;

      if (!forceCreate && tabState.notebookId) {
        const existingNotebookId = tabState.notebookId;
        let hasNotebook = useNotebookStore.getState().notebooks.some((entry) => entry.notebookId === existingNotebookId);
        if (!hasNotebook) {
          await loadNotebooksInStore();
          hasNotebook = useNotebookStore.getState().notebooks.some((entry) => entry.notebookId === existingNotebookId);
        }
        if (hasNotebook) {
          await setActiveNotebook(existingNotebookId);
          if (useNotebookStore.getState().activeNotebookId === existingNotebookId) {
            return existingNotebookId;
          }
        }
        setTabNotebookId(tabState.id, null);
      }

      // Fresh project bootstrap path: adopt the backend-default notebook for the only tab.
      if (!forceCreate) {
        const latestTabState = tabsRef.current.find((entry) => entry.id === currentTab.id) ?? tabState;
        if (!latestTabState.notebookId) {
          await loadNotebooksInStore();
          const availableNotebooks = useNotebookStore.getState().notebooks;
          const tabsWithoutNotebook = tabsRef.current.filter((entry) => !entry.notebookId);
          const mappedNotebookIds = new Set(
            tabsRef.current
              .map((entry) => entry.notebookId)
              .filter((value): value is string => Boolean(value))
          );
          const unassignedNotebooks = availableNotebooks.filter(
            (entry) => !mappedNotebookIds.has(entry.notebookId)
          );

          if (
            tabsWithoutNotebook.length === 1
            && tabsWithoutNotebook[0].id === latestTabState.id
            && unassignedNotebooks.length === 1
          ) {
            const adopted = unassignedNotebooks[0];
            setTabNotebookId(latestTabState.id, adopted.notebookId);
            await setActiveNotebook(adopted.notebookId);
            if (adopted.name !== latestTabState.name) {
              await renameNotebook(adopted.notebookId, latestTabState.name);
            }
            return adopted.notebookId;
          }
        }
      }

      const created = await createNotebook((tabsRef.current.find((entry) => entry.id === currentTab.id) ?? currentTab).name);
      const createdNotebookId = created?.notebookId ?? null;
      if (createdNotebookId) {
        setTabNotebookId(currentTab.id, createdNotebookId);
      }
      return createdNotebookId;
    })();

    notebookEnsureLocksRef.current.set(currentTab.id, ensurePromise);
    try {
      return await ensurePromise;
    } finally {
      notebookEnsureLocksRef.current.delete(currentTab.id);
    }
  }, [
    createNotebook,
    loadNotebooksInStore,
    renameNotebook,
    setActiveNotebook,
    setTabNotebookId
  ]);

  const tabIdsSignature = useMemo(
    () => tabs.map((tab) => tab.id).join('|'),
    [tabs]
  );

  useEffect(() => {
    if (!tabsReady || !projectId) {
      return;
    }
    if (notebookProjectId !== projectId) {
      return;
    }
    void reconcileTabNotebookMappings();
  }, [notebookProjectId, projectId, reconcileTabNotebookMappings, tabIdsSignature, tabsReady]);

  useEffect(() => {
    if (!tabsReady || !activeTab) {
      return;
    }
    if (activeTab.notebookId && activeNotebookId === activeTab.notebookId) {
      return;
    }

    void ensureNotebookForTab(activeTab);
  }, [activeNotebookId, activeTab, ensureNotebookForTab, tabsReady]);

  const saveActiveSnapshot = () => {
    if (!activeTab) return;
    setTabs((previous) => {
      const nextTabs = previous.map((tab) => (
        tab.id === activeTab.id
          ? { ...tab, snapshot: { selectedDatasetId, runId, timeline, stepBindings, replayReport } }
          : tab
      ));
      tabsRef.current = nextTabs;
      return nextTabs;
    });
  };

  const handleTabSwitch = (value: string) => {
    if (!activeTab) return;
    const targetTab = tabsRef.current.find((tab) => tab.id === value);
    if (!targetTab || targetTab.id === activeTab.id) return;
    saveActiveSnapshot();
    setActiveTabId(targetTab.id);
    applyTabSnapshot(targetTab.snapshot);
    void ensureNotebookForTab(targetTab);
  };

  const handleNewTab = () => {
    if (!activeTab) return;
    const newTab: PreprocessingTab = {
      id: createTabId(),
      name: nextProcessingTabName(tabsRef.current),
      notebookId: null,
      snapshot: createEmptyTabSnapshot(),
      storageVersion: 0
    };
    saveActiveSnapshot();
    setTabs((previous) => {
      const nextTabs = [...previous, newTab];
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    setActiveTabId(newTab.id);
    applyTabSnapshot(newTab.snapshot);
    void ensureNotebookForTab(newTab);
  };

  const handleDeleteTab = () => {
    if (!activeTab || tabs.length <= 1) return;
    const deletedTab = activeTab;
    const targetIndex = tabs.findIndex((tab) => tab.id === activeTab.id);
    const fallbackTab = tabs[targetIndex - 1] ?? tabs[targetIndex + 1];
    if (!fallbackTab) return;
    const notebookIdToDelete = deletedTab.notebookId;
    if (projectId) {
      localStorage.removeItem(buildScopedTabStorageKey(activeTab.id));
    }
    setTabs((previous) => {
      const nextTabs = previous.filter((tab) => tab.id !== activeTab.id);
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    setActiveTabId(fallbackTab.id);
    applyTabSnapshot(fallbackTab.snapshot);
    void (async () => {
      const fallbackNotebookId = await ensureNotebookForTab(fallbackTab);
      if (
        notebookIdToDelete
        && notebookIdToDelete !== fallbackNotebookId
      ) {
        await deleteNotebook(notebookIdToDelete);
      }
    })();
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
    const notebookId = activeTab.notebookId;
    setTabs((previous) => {
      const nextTabs = previous.map((tab) =>
        tab.id === activeTab.id ? { ...tab, name: trimmed } : tab
      );
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    if (notebookId) {
      void renameNotebook(notebookId, trimmed);
    }
    setRenameTabDialogOpen(false);
  };

  const resetActiveTab = () => {
    if (!activeTab) return;
    const oldNotebookId = activeTab.notebookId;

    if (projectId) {
      localStorage.removeItem(buildScopedTabStorageKey(activeTab.id));
    }

    const nextSnapshot = createEmptyTabSnapshot();
    const resetTab: PreprocessingTab = {
      ...activeTab,
      notebookId: null,
      snapshot: nextSnapshot
    };
    setTabs((previous) => {
      const nextTabs = previous.map((tab) => (
        tab.id === activeTab.id
          ? {
              ...tab,
              notebookId: null,
              snapshot: nextSnapshot,
              storageVersion: tab.storageVersion + 1
            }
          : tab
      ));
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    applyTabSnapshot(nextSnapshot);
    setDatasetModalOpen(true);
    void (async () => {
      const nextNotebookId = await ensureNotebookForTab(resetTab, { forceCreate: true });
      if (
        oldNotebookId
        && oldNotebookId !== nextNotebookId
      ) {
        await deleteNotebook(oldNotebookId);
      }
    })();
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

            {sortedTimeline.length > 0 ? (
              <div className="space-y-3 mt-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Transformation Timeline</h2>
                  <p className="text-xs text-muted-foreground">Cards are projected from structured tool events. Notebook remains the execution source of truth.</p>
                </div>
                {sortedTimeline.map((event) => {
                  const rowCountSummary = getRowCountSummary(event);
                  const validationSummary = summarizeValidation(event);
                  const hasValidationSummary = Boolean(rowCountSummary || validationSummary);

                  return (
                    <Card key={event.id} className={cn('border', event.status === 'diverged' ? projectAccentClasses.border : '')}>
                      <CardHeader className="space-y-2 pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <CardTitle className="text-sm font-semibold">{event.title}</CardTitle>
                            <p className="text-xs text-muted-foreground">{event.toolName} · step {event.stepId.slice(0, 8)}</p>
                          </div>
                          <Badge className={cn('border', statusClassName(event.status, divergedAccentClassName))}>{STATUS_LABELS[event.status]}</Badge>
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

                        {hasValidationSummary ? (
                          <div className="rounded-md border bg-muted/20 p-2">
                            <p className="font-medium">Validation</p>
                            {rowCountSummary ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground">
                                <span>Rows {rowCountSummary.before}</span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                <span>{rowCountSummary.after}</span>
                                {rowCountSummary.schemaDrift ? (
                                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                    Schema drift
                                  </Badge>
                                ) : null}
                              </div>
                            ) : (
                              <p className="text-muted-foreground">{validationSummary}</p>
                            )}
                          </div>
                        ) : null}

                        {event.status === 'awaiting_approval' ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                            <ShieldAlert className="h-4 w-4 text-amber-600" />
                            <span className="text-amber-700">This step requires explicit approval.</span>
                            <div className="ml-auto flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleRejectStep(event.stepId)}>
                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                Reject
                              </Button>
                              <Button size="sm" onClick={() => handleApproveStep(event.stepId)}>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                Approve
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {event.status === 'diverged' ? (
                          <div className={cn('rounded-md border p-2', divergedAccentClassName)}>
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
