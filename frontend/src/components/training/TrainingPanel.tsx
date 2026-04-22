/**
 * TrainingPanel - Jupyter-style training interface with AI assistance
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Wand2 } from 'lucide-react';
import { CodeCell } from './CodeCell';
import { ModelRecommendationCard } from './ModelRecommendationCard';
import type { Cell } from '@/types/cell';
import { cn } from '@/lib/utils';
import { useExecutionStore } from '@/stores/executionStore';
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import { getPreviousPhaseDataset, persistPhaseDataset } from '@/lib/phaseDatasetPersistence';
import { generateFeatureEngineeringCode } from '@/lib/features/codeGenerator';
import type { UiItem, ChatMessage, UiSchema, UiSection } from '@/types/llmUi';
import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ChatMessageRenderer } from '@/components/agentic/ChatMessageRenderer';
import { useLifecycleCards } from '@/components/agentic/useLifecycleCards';
import { useWorkflowPlaceholders } from '@/hooks/useWorkflowPlaceholders';
import { RenameTabDialog } from '@/components/preprocessing/PreprocessingDialogs';
import type { SavepointDiff } from '@/types/savepoint';
import { createTrainingAdapter } from './TrainingAdapter';
import { TrainingApprovalGate } from './TrainingApprovalGate';
import { TrainingToolbarLeft, TrainingToolbarRight } from './TrainingToolbar';
import { useTrainingWorkbooks } from './hooks/useTrainingWorkbooks';
import { useTrainingNotebookSync } from './hooks/useTrainingNotebookSync';
import { buildWorkflowSessionKey, useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { useModelStore } from '@/stores/modelStore';
import { usePhaseNotebookRecovery } from '@/hooks/usePhaseNotebookRecovery';
import { useTrainingPanelSearchState } from './useTrainingPanelSearchState';

type CodeCellUiItem = Extract<UiItem, { type: 'code_cell' }>;
type TrainingProposalSelection = { title: string; selected: boolean };

function extractPendingTrainingProposalTitle(message: Extract<ChatMessage, { type: 'tool_call' }>): string {
  const output = message.result?.output;
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const experimentName = (output as Record<string, unknown>).experimentName;
    if (typeof experimentName === 'string' && experimentName.trim().length > 0) {
      return experimentName;
    }
  }

  const args = message.call.args;
  if (typeof args?.experimentName === 'string' && args.experimentName.trim().length > 0) {
    return args.experimentName;
  }
  if (typeof args?.modelName === 'string' && args.modelName.trim().length > 0) {
    return args.modelName;
  }

  return 'Training Plan';
}

function isPendingTrainingProposal(message: ChatMessage): message is Extract<ChatMessage, { type: 'tool_call' }> {
  if (message.type !== 'tool_call' || message.call.tool !== 'propose_training_plan') {
    return false;
  }
  if (!message.result) {
    return true;
  }
  const output = message.result.output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return false;
  }
  return (output as Record<string, unknown>).status === 'awaiting_approval';
}

function collectActivePendingTrainingProposals(messages: ChatMessage[]): Array<{ id: string; title: string }> {
  const pendingProposals: Array<{ id: string; title: string }> = [];

  // Only treat a trailing block of pending training proposals as active.
  // Older proposal cards from prior turns stay in history, but they should
  // not keep the global approval gate visible after training continues.
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type !== 'tool_call') {
      continue;
    }
    if (isPendingTrainingProposal(message)) {
      pendingProposals.push({
        id: message.call.id,
        title: extractPendingTrainingProposalTitle(message)
      });
      continue;
    }
    break;
  }

  return pendingProposals.reverse();
}

interface TrainingConversationPaneProps {
  messages: ChatMessage[];
  error: string | null;
  isGenerating: boolean;
  activeTextMessageId?: string | null;
  activeThinkingMessageId?: string | null;
  hydratedMessageIds?: Set<string>;
  onEditMessage?: (id: string) => void;
  onRevertToMessage?: (id: string) => void;
  editingMessageId?: string | null;
  turnDiffs?: ReadonlyMap<string, SavepointDiff>;
  onRetryWorkflow?: () => void;
  renderLifecycleCard: (message: ChatMessage) => ReactNode | null;
  syncLlmCells: (messages: ChatMessage[]) => void;
  proposalSelections: Map<string, TrainingProposalSelection>;
  setProposalSelections: Dispatch<SetStateAction<Map<string, TrainingProposalSelection>>>;
  proposalsSubmitted: boolean;
  setProposalsSubmitted: Dispatch<SetStateAction<boolean>>;
  submitPromptRef: MutableRefObject<((prompt: string) => void) | undefined>;
}

function TrainingConversationPane({
  messages,
  error,
  isGenerating,
  activeTextMessageId,
  activeThinkingMessageId,
  hydratedMessageIds,
  onEditMessage,
  onRevertToMessage,
  editingMessageId,
  turnDiffs,
  onRetryWorkflow,
  renderLifecycleCard,
  syncLlmCells,
  proposalSelections,
  setProposalSelections,
  proposalsSubmitted,
  setProposalsSubmitted,
  submitPromptRef
}: TrainingConversationPaneProps) {
  useEffect(() => {
    syncLlmCells(messages);
  }, [messages, syncLlmCells]);

  const pendingProposals = useMemo(
    () => collectActivePendingTrainingProposals(messages),
    [messages]
  );
  const pendingProposalIds = useMemo(
    () => pendingProposals.map((proposal) => proposal.id),
    [pendingProposals]
  );
  const pendingProposalCount = pendingProposalIds.length;
  const pendingProposalSignature = useMemo(
    () => [...pendingProposalIds].sort().join('|'),
    [pendingProposalIds]
  );

  useEffect(() => {
    setProposalSelections((prev) => {
      let changed = prev.size !== pendingProposalIds.length;
      const next = new Map<string, TrainingProposalSelection>();
      let hasSelectedModel = false;
      for (const proposal of pendingProposals) {
        const existing = prev.get(proposal.id);
        if (existing) {
          const shouldSelect = existing.selected && !hasSelectedModel;
          if (existing.selected && hasSelectedModel) {
            changed = true;
          }
          next.set(proposal.id, {
            title: proposal.title,
            selected: shouldSelect
          });
          if (shouldSelect) {
            hasSelectedModel = true;
          }
        } else {
          changed = true;
          next.set(proposal.id, { title: proposal.title, selected: false });
        }
      }

      if (!hasSelectedModel && pendingProposalCount > 0) {
        const firstProposalId = pendingProposals[0].id;
        const firstProposal = next.get(firstProposalId);
        next.set(firstProposalId, {
          title: firstProposal?.title ?? pendingProposals[0].title,
          selected: true
        });
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [pendingProposalCount, pendingProposalIds.length, pendingProposals, proposalSelections.size, setProposalSelections]);

  const lastProposalSignatureRef = useRef<string>('');
  useEffect(() => {
    if (lastProposalSignatureRef.current === pendingProposalSignature) {
      return;
    }
    lastProposalSignatureRef.current = pendingProposalSignature;
    setProposalsSubmitted(false);
  }, [pendingProposalSignature, setProposalsSubmitted]);

  const selectedProposalEntries = useMemo(
    () => pendingProposalIds
      .map((proposalId) => {
        const proposal = proposalSelections.get(proposalId);
        return proposal?.selected ? proposal : null;
      })
      .filter((proposal): proposal is TrainingProposalSelection => proposal !== null),
    [pendingProposalIds, proposalSelections]
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 pt-6">
      {pendingProposalIds.length > 0 ? (
        <TrainingApprovalGate
          totalModels={pendingProposalIds.length}
          selectedModels={selectedProposalEntries.length}
          isGenerating={isGenerating && proposalsSubmitted}
          isSubmitted={proposalsSubmitted}
          onApply={() => {
            const selectedProposal = selectedProposalEntries[0];
            const name = selectedProposal?.title;
            if (!name) {
              return;
            }
            setProposalsSubmitted(true);
            submitPromptRef.current?.(`Approved. Proceed with training the selected model: ${name}.`);
          }}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-28">
        <div className="space-y-4">
          {error && <div className="text-sm text-red-500">{error}</div>}

          <ChatMessageRenderer
            messages={messages}
            renderLifecycleCard={renderLifecycleCard}
            activeTextMessageId={activeTextMessageId}
            activeThinkingMessageId={activeThinkingMessageId}
            hydratedMessageIds={hydratedMessageIds}
            onEditMessage={onEditMessage}
            onRevertToMessage={onRevertToMessage}
            editingMessageId={editingMessageId}
            turnDiffs={turnDiffs}
            isGenerating={isGenerating}
            onRetryWorkflow={onRetryWorkflow}
          />
        </div>
      </div>
    </div>
  );
}

export function TrainingPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const composerPlaceholders = useWorkflowPlaceholders(projectId, 'training');
  const {
    initialWorkbookId,
    initialNotebookId,
    requestedWorkbookId,
    syncWorkbookParam
  } = useTrainingPanelSearchState();
  const initialNotebookIdRef = useRef(initialNotebookId);

  const {
    workbooks: trainingWorkbooks,
    activeWorkbookId: activeTrainingWorkbookId,
    activeWorkbook: activeTrainingWorkbook,
    chatSessionVersion: trainingChatSessionVersion,
    buildStorageKey: buildTrainingStorageKey,
    handleSwitch: handleWorkbookSwitch,
    handleNew: handleNewWorkbook,
    handleDelete: handleDeleteWorkbook,
    handleRename: handleRenameWorkbook,
    handleReplay: handleReplayWorkbook,
    handleReset: handleResetWorkbook,
    setWorkbookNotebookId,
    renameDialogOpen,
    setRenameDialogOpen,
    renameDialogValue,
    setRenameDialogValue,
    openRenameDialog
  } = useTrainingWorkbooks(projectId, {
    requestedWorkbookId: requestedWorkbookId ?? initialWorkbookId ?? undefined,
    syncWorkbookParam
  });

  // Resolve a training-scoped notebook for the active workbook. The hook
  // creates/adopts a notebook with metadata { phase: 'training', tabId, tabName }
  // and never adopts notebooks from other phases — so the FE notebook left
  // over from a previous tab is not touched, keeping FE cells intact. The
  // isTrainingNotebookReady flag gates AgenticShell's mount below; without
  // that gate, AgenticShell's initializeNotebook(undefined) fallback would
  // activate notebooks[0] (often an FE notebook) during the first render.
  const { notebookId: resolvedTrainingNotebookId, isReady: isTrainingNotebookReady } = useTrainingNotebookSync({
    projectId,
    activeWorkbook: activeTrainingWorkbook,
    setWorkbookNotebookId,
    initialNotebookId: initialNotebookIdRef.current
  });

  // Stable getter for the adapter — reading the ref means the adapter
  // identity does not change on every notebook resolution update, which
  // would otherwise cascade into useAgenticLoop state churn mid-session.
  const resolvedNotebookIdRef = useRef<string | null>(resolvedTrainingNotebookId);
  useEffect(() => {
    resolvedNotebookIdRef.current = resolvedTrainingNotebookId;
  }, [resolvedTrainingNotebookId]);
  const getTrainingNotebookId = useCallback(
    () => resolvedNotebookIdRef.current ?? undefined,
    []
  );

  const [cells, setCells] = useState<Cell[]>([]);
  const cellsRef = useRef<Cell[]>(cells);
  const [trainingDatasetId, setTrainingDatasetId] = useState<string | null>(null);
  const [trainingTargetColumn, setTrainingTargetColumn] = useState<string | undefined>();

  const autoRunIdsRef = useRef(new Set<string>());
  const submitPromptRef = useRef<((prompt: string) => void) | undefined>(undefined);

  // Track proposal selections for multi-model approval flow
  const [proposalSelections, setProposalSelections] = useState<Map<string, TrainingProposalSelection>>(new Map());
  const [proposalsSubmitted, setProposalsSubmitted] = useState(false);
  const hasMountedProposalStateRef = useRef(false);

  const { executeCode: executeWithStore } = useExecutionStore();

  // NOTE: the URL ?notebook=<id> deep link is no longer applied by calling
  // setActiveNotebook directly — that bypassed phase isolation and would
  // activate an FE/preprocessing notebook globally. useTrainingNotebookSync
  // now consumes initialNotebookIdRef.current, adopts the deep-linked
  // notebook only if its metadata.phase === 'training', and ignores
  // anything else with a console warning.

  // Files
  const files = useDataStore((s) => s.files);
  const hydrateFromBackend = useDataStore((s) => s.hydrateFromBackend);
  const projectFiles = useMemo(() => projectId ? files.filter(f => f.projectId === projectId) : [], [files, projectId]);
  const datasetFiles = useMemo(() => projectFiles.filter((file) => file.metadata?.datasetId), [projectFiles]);
  const trainingDatasetOptions = useMemo(
    () => datasetFiles.map((file) => ({
      datasetId: file.metadata?.datasetId,
      name: file.name,
      columns: file.metadata?.columns ?? []
    })).filter((file): file is { datasetId: string; name: string; columns: string[] } => Boolean(file.datasetId)),
    [datasetFiles]
  );
  const datasetCompletionFiles = useMemo(() => datasetFiles.map((file) => file.name), [datasetFiles]);
  const selectedTrainingFile = useMemo(() => datasetFiles.find((file) => file.metadata?.datasetId === trainingDatasetId), [datasetFiles, trainingDatasetId]);
  const documentFiles = useMemo(() => projectFiles.filter((file) => file.metadata?.documentId), [projectFiles]);

  // Features
  const features = useFeatureStore((s) => s.features);
  const hydrateFeatures = useFeatureStore((s) => s.hydrateFromProject);
  const projectFeatures = useMemo(() => projectId ? features.filter(f => f.projectId === projectId && f.enabled) : [], [features, projectId]);

  useEffect(() => {
    if (!projectId) return;
    hydrateFeatures(projectId);
    hydrateFromBackend(projectId);
    void useModelStore.getState().refreshModels(projectId);
  }, [projectId, hydrateFeatures, hydrateFromBackend]);

  useEffect(() => {
    if (!trainingDatasetId && trainingDatasetOptions.length > 0) {
      const previousId = projectId ? getPreviousPhaseDataset(projectId, 'feature-engineering', 'preprocessing') : undefined;
      const match = previousId
        ? trainingDatasetOptions.find(o => o.datasetId === previousId)
        : undefined;
      setTrainingDatasetId(match?.datasetId ?? trainingDatasetOptions[0].datasetId);
    }
  }, [trainingDatasetId, trainingDatasetOptions, projectId]);

  useEffect(() => {
    if (projectId && trainingDatasetId) persistPhaseDataset(projectId, 'training', trainingDatasetId);
  }, [trainingDatasetId, projectId]);

  useEffect(() => {
    const selected = trainingDatasetOptions.find((dataset) => dataset.datasetId === trainingDatasetId);
    if (!selected) return;
    if (trainingTargetColumn && !selected.columns.includes(trainingTargetColumn)) {
      setTrainingTargetColumn(undefined);
    }
  }, [trainingDatasetOptions, trainingDatasetId, trainingTargetColumn]);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  const generateCellId = () => `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const addCodeCell = useCallback((content: string = '') => {
    const newCell: Cell = { id: generateCellId(), type: 'code', content, status: 'idle', createdAt: new Date().toISOString() };
    setCells(prev => [...prev, newCell]);
  }, []);

  const handleGenerateFeatureCode = useCallback(() => {
    if (projectFeatures.length === 0 || datasetFiles.length === 0) return;
    const datasetFile = datasetFiles[0];
    const code = generateFeatureEngineeringCode(projectFeatures, datasetFile.name, { datasetId: datasetFile.metadata?.datasetId });
    addCodeCell(code);
  }, [projectFeatures, datasetFiles, addCodeCell]);

  const buildFeatureSummary = useCallback(() => {
    if (projectFeatures.length === 0) return undefined;
    const names = projectFeatures.slice(0, 6).map((feature) => feature.featureName);
    const suffix = projectFeatures.length > 6 ? ` +${projectFeatures.length - 6} more` : '';
    return `${projectFeatures.length} enabled features: ${names.join(', ')}${suffix}`;
  }, [projectFeatures]);

  const handleCellContentChange = useCallback((cellId: string, content: string) => {
    setCells(prev => prev.map(cell => cell.id === cellId ? { ...cell, content } : cell));
  }, []);
  const handleDeleteCell = useCallback((cellId: string) => {
    setCells(prev => prev.filter(cell => cell.id !== cellId));
  }, []);

  const handleRunCell = useCallback(async (cellId: string) => {
    if (!projectId) return;
    const currentCells = cellsRef.current;
    const cell = currentCells.find(c => c.id === cellId);
    if (!cell || cell.type !== 'code') return;
    setCells(prev => prev.map(c => c.id === cellId ? { ...c, status: 'running' as const, executedAt: new Date().toISOString() } : c));
    try {
      const result = await executeWithStore(cell.content, projectId);
      setCells(prev => prev.map(c => {
        if (c.id !== cellId) return c;
        return {
          ...c,
          status: result.status === 'success' ? 'success' as const : 'error' as const,
          executionDurationMs: result.executionMs,
          output: {
            type: result.status === 'error' ? 'error' as const : 'text' as const,
            content: result.stdout || result.stderr || '',
            data: result.outputs
          }
        };
      }));
    } catch (error) {
      setCells(prev => prev.map(c => c.id === cellId ? { ...c, status: 'error' as const, output: { type: 'error' as const, content: error instanceof Error ? error.message : 'Execution failed' } } : c));
    }
  }, [projectId, executeWithStore]);

  const renderTrainingItem = (item: UiItem) => {
    switch (item.type) {
      case 'dataset_summary':
        return (
          <Card key={item.datasetId} className="border-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dataset snapshot</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <div className="flex items-center justify-between">
                <span>{item.filename}</span>
                <Badge variant="outline" className="text-[10px]">{item.rows} rows</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>{item.columns} columns</span>
                <Badge variant="secondary" className="text-[10px]">{item.datasetId.slice(0, 8)}</Badge>
              </div>
            </CardContent>
          </Card>
        );
      case 'report':
        return (
          <Card key={item.id} className="border-muted/40">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{item.title}</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {item.format === 'markdown' ? <div className="prose prose-sm dark:prose-invert">{item.content}</div> : <p className="whitespace-pre-wrap">{item.content}</p>}
            </CardContent>
          </Card>
        );
      case 'code_cell': {
        const cellId = `llm-${item.id}`;
        const cell = cells.find((entry) => entry.id === cellId);
        if (!cell) return null;
        return (
          <div key={item.id} className="space-y-2">
            {item.title && <p className="text-xs font-medium text-muted-foreground">{item.title}</p>}
            <CodeCell
              cell={cell}
              cellNumber={Math.max(1, cells.findIndex((entry) => entry.id === cellId) + 1)}
              onRun={cell.type === 'code' ? () => handleRunCell(cell.id) : undefined}
              onDelete={() => handleDeleteCell(cell.id)}
              onContentChange={cell.type === 'code' ? (content) => handleCellContentChange(cell.id, content) : undefined}
              isRunning={cell.status === 'running'}
              datasetFiles={datasetCompletionFiles}
            />
          </div>
        );
      }
      case 'model_recommendation':
        return (
          <ModelRecommendationCard
            key={item.id}
            id={item.id}
            template={item.template}
            parameters={item.parameters as Record<string, unknown>}
            rationale={item.rationale}
          />
        );
      case 'callout':
        return <div key={item.text} className={cn('rounded-md border px-3 py-2 text-xs', item.tone === 'warning' && 'border-amber-500/40 text-amber-600', item.tone === 'success' && 'border-emerald-500/40 text-emerald-600')}>{item.text}</div>;
      default: return null;
    }
  };

  const baseRenderLifecycleCard = useLifecycleCards({
    onProposalToggle: (stepId, title, selected) => {
      setProposalSelections(prev => {
        const next = new Map(prev);
        if (selected) {
          for (const [existingStepId, proposal] of next.entries()) {
            next.set(existingStepId, {
              ...proposal,
              selected: existingStepId === stepId
            });
          }
          next.set(stepId, { title, selected: true });
          return next;
        }
        next.set(stepId, { title, selected: false });
        return next;
      });
    },
    getProposalSelected: (stepId) => proposalSelections.get(stepId)?.selected ?? null,
  });

  /** Extends lifecycle cards with training-specific ui message rendering */
  const renderLifecycleCard = useCallback(
    (message: ChatMessage): ReactNode | null => {
      if (message.type === 'ui') {
        return (
          <div className="space-y-4">
            {message.schema.sections.map((section: UiSection) => (
              <div key={section.id} className="space-y-3">
                {section.title && <h3 className="text-sm font-semibold">{section.title}</h3>}
                <div className="space-y-3">
                  {section.items.map(renderTrainingItem)}
                </div>
              </div>
            ))}
          </div>
        );
      }

      return baseRenderLifecycleCard(message);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseRenderLifecycleCard, cells, datasetCompletionFiles]
  );

  /** Sync LLM-emitted code cells into local cell state */
  const syncLlmCells = useCallback((messages: ChatMessage[]) => {
    const uiSchemas = messages.filter((m): m is Extract<ChatMessage, { type: 'ui' }> => m.type === 'ui').map(m => m.schema as UiSchema);
    const lastUiSchema = uiSchemas[uiSchemas.length - 1];
    if (!lastUiSchema) return;

    const llmCodeCells: CodeCellUiItem[] = lastUiSchema.sections.flatMap((section) =>
      section.items.filter((item): item is CodeCellUiItem => item.type === 'code_cell')
    );

    if (llmCodeCells.length === 0) return;

    setCells((prev) => {
      const manualCells = prev.filter((cell) => !cell.id.startsWith('llm-'));
      const existingMap = new Map(prev.map((cell) => [cell.id, cell]));
      const nextLlmCells = llmCodeCells.map((item) => {
        const id = `llm-${item.id}`;
        const existing = existingMap.get(id);
        if (existing) {
          if (existing.content === item.content) return existing;
          return { ...existing, content: item.content };
        }
        return { id, type: 'code' as const, content: item.content, status: 'idle' as const, createdAt: new Date().toISOString() };
      });
      return [...manualCells, ...nextLlmCells];
    });

    // Auto run
    llmCodeCells.forEach((item) => {
      if (!item.autoRun) return;
      const cellId = `llm-${item.id}`;
      if (autoRunIdsRef.current.has(cellId)) return;
      const cell = cellsRef.current.find((entry) => entry.id === cellId);
      if (!cell || cell.status !== 'idle') return;
      autoRunIdsRef.current.add(cellId);
      void handleRunCell(cellId);
    });
  }, [handleRunCell]);

  const trainingStorageKey = buildTrainingStorageKey(activeTrainingWorkbookId);
  const { isRecoveryReady } = usePhaseNotebookRecovery({
    projectId,
    phase: 'training',
    notebookId: resolvedTrainingNotebookId,
    storageKey: trainingStorageKey,
    enabled: isTrainingNotebookReady
  });
  const trainingSessionKey = useMemo(
    () => buildWorkflowSessionKey(
      projectId ?? 'training',
      [
        trainingStorageKey,
        selectedTrainingFile?.metadata?.datasetId ?? 'none',
        trainingTargetColumn ?? 'no-target'
      ].join(':')
    ),
    [
      projectId,
      selectedTrainingFile?.metadata?.datasetId,
      trainingStorageKey,
      trainingTargetColumn
    ]
  );

  // Wrap handleResetWorkbook to also clear the workflow session store so
  // the stale runId/threadId (pointing at the old run with the deleted
  // notebook's activeNotebookId) cannot survive into the next prompt.
  const handleResetWithSessionClear = useCallback(() => {
    useWorkflowSessionStore.getState().clearSession(trainingSessionKey);
    handleResetWorkbook();
  }, [handleResetWorkbook, trainingSessionKey]);

  const trainingAdapter = useMemo(() => createTrainingAdapter({
    projectId: projectId ?? '',
    datasetId: selectedTrainingFile?.metadata?.datasetId,
    targetColumn: trainingTargetColumn,
    featureSummary: buildFeatureSummary(),
    datasetFiles,
    documentFiles,
    sessionKey: trainingSessionKey,
    // Ref-backed getter keeps adapter identity stable across notebook
    // resolution updates — avoids cascading useAgenticLoop resets.
    getNotebookId: getTrainingNotebookId
  }), [
    buildFeatureSummary,
    datasetFiles,
    documentFiles,
    projectId,
    selectedTrainingFile?.metadata?.datasetId,
    trainingSessionKey,
    trainingTargetColumn,
    getTrainingNotebookId
  ]);

  useEffect(() => {
    if (!hasMountedProposalStateRef.current) {
      hasMountedProposalStateRef.current = true;
      return;
    }
    setProposalSelections(new Map());
    setProposalsSubmitted(false);
  }, [activeTrainingWorkbookId, trainingChatSessionVersion]);

  return (
    <>
      {isTrainingNotebookReady && isRecoveryReady ? (
      <AgenticShell
        projectId={projectId ?? ''}
        composerPlaceholders={composerPlaceholders}
        storageKey={trainingStorageKey}
        notebookId={resolvedTrainingNotebookId ?? undefined}
        domainAdapter={trainingAdapter}
        leftPaneScrollable={false}
        renderLeftPane={(renderProps) => {
          submitPromptRef.current = renderProps.submitPrompt;
          return (
            <TrainingConversationPane
              messages={renderProps.messages}
              error={renderProps.error}
              isGenerating={renderProps.isGenerating}
              activeTextMessageId={renderProps.activeTextMessageId}
              activeThinkingMessageId={renderProps.activeThinkingMessageId}
              hydratedMessageIds={renderProps.hydratedMessageIds}
              onEditMessage={renderProps.onEditMessage}
              onRevertToMessage={renderProps.onRevertToMessage}
              editingMessageId={renderProps.editingMessageId}
              turnDiffs={renderProps.turnDiffs}
              onRetryWorkflow={renderProps.onRetryWorkflow}
              renderLifecycleCard={renderLifecycleCard}
              syncLlmCells={syncLlmCells}
              proposalSelections={proposalSelections}
              setProposalSelections={setProposalSelections}
              proposalsSubmitted={proposalsSubmitted}
              setProposalsSubmitted={setProposalsSubmitted}
              submitPromptRef={submitPromptRef}
            />
          );
        }}
        toolbarLeft={
          <TrainingToolbarLeft
            workbooks={trainingWorkbooks}
            activeWorkbookId={activeTrainingWorkbookId}
            onSwitch={handleWorkbookSwitch}
            onNew={handleNewWorkbook}
            onRename={openRenameDialog}
            onReplay={handleReplayWorkbook}
            onReset={handleResetWithSessionClear}
            onDelete={handleDeleteWorkbook}
            canDelete={trainingWorkbooks.length > 1}
          />
        }
        toolbarRight={
          <div className="flex items-center gap-2">
            <TrainingToolbarRight
              selectedDatasetId={trainingDatasetId ?? ''}
              datasetOptions={trainingDatasetOptions}
              onDatasetSelect={setTrainingDatasetId}
              selectedTargetColumn={trainingTargetColumn ?? ''}
              targetColumns={selectedTrainingFile?.metadata?.columns ?? []}
              onTargetColumnSelect={setTrainingTargetColumn}
            />
            {projectFeatures.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={handleGenerateFeatureCode}>
                      <Wand2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Generate feature code</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        }
      />
      ) : (
        <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
          Preparing training notebook...
        </div>
      )}

      <RenameTabDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        value={renameDialogValue}
        onValueChange={setRenameDialogValue}
        onSave={() => handleRenameWorkbook(renameDialogValue)}
        title="Rename workbook"
        description="Update the name of the current training workbook."
      />
    </>
  );
}
