/**
 * TrainingPanel - Jupyter-style training interface with AI assistance
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Loader2,
  Wand2
} from 'lucide-react';
import { CodeCell } from './CodeCell';
import type { Cell } from '@/types/cell';
import { cn } from '@/lib/utils';
import { useExecutionStore } from '@/stores/executionStore';
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import { useProjectStore } from '@/stores/projectStore';
import { generateFeatureEngineeringCode } from '@/lib/features/codeGenerator';
import type { UiItem, ChatMessage, UiSchema, UiSection } from '@/types/llmUi';
import { AgenticShell } from '@/components/agentic/AgenticShell';
import { createTrainingAdapter } from './TrainingAdapter';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';

type CodeCellUiItem = Extract<UiItem, { type: 'code_cell' }>;
const EMPTY_PIPELINE_VERSIONS: Array<{ status: string }> = [];

export function TrainingPanel() {
  const { projectId } = useParams<{ projectId: string }>();

  const [cells, setCells] = useState<Cell[]>([]);
  const cellsRef = useRef<Cell[]>(cells);
  const [trainingDatasetId, setTrainingDatasetId] = useState<string | null>(null);
  const [trainingTargetColumn, setTrainingTargetColumn] = useState<string | undefined>();
  
  const autoRunIdsRef = useRef(new Set<string>());

  const { executeCode: executeWithStore } = useExecutionStore();


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
  const pipelineVersions = useFeatureStore((s) => (
    projectId ? s.versions[projectId] ?? EMPTY_PIPELINE_VERSIONS : EMPTY_PIPELINE_VERSIONS
  ));
  const hydrateFeatures = useFeatureStore((s) => s.hydrateFromProject);
  const projectMetadata = useProjectStore((state) => projectId ? state.getProjectById(projectId)?.metadata : undefined);
  const projectFeatures = useMemo(() => projectId ? features.filter(f => f.projectId === projectId && f.enabled) : [], [features, projectId]);
  const feWorkflowVersion = typeof projectMetadata?.feWorkflowVersion === 'number' ? projectMetadata.feWorkflowVersion : undefined;
  const hasApprovedFePipeline = pipelineVersions.some((version) => version.status === 'approved');
  const trainingBlockedByFeGate = feWorkflowVersion === 2 && !hasApprovedFePipeline;

  useEffect(() => {
    if (!projectId) return;
    hydrateFeatures(projectId);
    hydrateFromBackend(projectId);
  }, [projectId, hydrateFeatures, hydrateFromBackend]);

  useEffect(() => {
    if (!trainingDatasetId && trainingDatasetOptions.length > 0) {
      setTrainingDatasetId(trainingDatasetOptions[0].datasetId);
    }
  }, [trainingDatasetId, trainingDatasetOptions]);

  useEffect(() => {
    const selected = trainingDatasetOptions.find((dataset) => dataset.datasetId === trainingDatasetId);
    if (!selected) return;
    if (!trainingTargetColumn || !selected.columns.includes(trainingTargetColumn)) {
      setTrainingTargetColumn(selected.columns[0]);
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
      case 'callout':
        return <div key={item.text} className={cn('rounded-md border px-3 py-2 text-xs', item.tone === 'warning' && 'border-amber-500/40 text-amber-600', item.tone === 'success' && 'border-emerald-500/40 text-emerald-600')}>{item.text}</div>;
      default: return null;
    }
  };

  const LeftPaneComponent = ({
    messages,
    isGenerating,
    error,
    activeTextMessageId,
    activeThinkingMessageId,
    hydratedMessageIds
  }: {
    messages: ChatMessage[];
    isGenerating: boolean;
    error: string | null;
    activeTextMessageId: string | null;
    activeThinkingMessageId: string | null;
    hydratedMessageIds: Set<string>;
  }) => {
    // Sync cells on render or effect
    const uiSchemas = messages.filter(m => m.type === 'ui').map(m => m.schema as UiSchema);
    const lastUiSchema = uiSchemas[uiSchemas.length - 1];
    const llmCodeCells = useMemo((): CodeCellUiItem[] => {
      if (!lastUiSchema) {
        return [];
      }

      return lastUiSchema.sections.flatMap((section) =>
        section.items.filter((item): item is CodeCellUiItem => item.type === 'code_cell')
      );
    }, [lastUiSchema]);
    
    // Auto sync effect
    useEffect(() => {
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
    }, [llmCodeCells]);
    
    // Auto run effect
    useEffect(() => {
      if (llmCodeCells.length === 0) return;
      llmCodeCells.forEach((item) => {
        if (!item.autoRun) return;
        const cellId = `llm-${item.id}`;
        if (autoRunIdsRef.current.has(cellId)) return;
        const cell = cellsRef.current.find((entry) => entry.id === cellId);
        if (!cell || cell.status !== 'idle') return;
        autoRunIdsRef.current.add(cellId);
        void handleRunCell(cellId);
      });
    }, [llmCodeCells]);

    return (
      <div className="p-6 space-y-4">
        {trainingBlockedByFeGate ? (
          <Card className="border-amber-400/50 bg-amber-50 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-800 dark:text-amber-300">
                Training Locked: Feature Pipeline Approval Required
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-amber-800/90 dark:text-amber-200/90 space-y-1">
              <p>Approve a Feature Engineering pipeline before starting model training.</p>
              <p>Once approved, this workspace unlocks automatically with a pinned transformation lineage.</p>
            </CardContent>
          </Card>
        ) : null}

        {error && <div className="text-sm text-red-500">{error}</div>}

        <div className="space-y-4">
          {messages.map((msg) => {
            if (msg.type === 'user') {
              return (
                <div key={msg.id} className="flex flex-col items-end group">
                  <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              );
            }
            if (msg.type === 'assistant_text') {
              return (
                <div key={msg.id} className="flex items-start gap-3 w-full">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                    <Wand2 className="h-3 w-3 text-emerald-600" />
                  </div>
                  <ProgressiveMessageText
                    messageId={msg.id}
                    text={msg.content}
                    isLive={activeTextMessageId === msg.id}
                    mode="markdown"
                    animateOnMount={!hydratedMessageIds.has(msg.id)}
                    className="llm-assistant-markdown prose prose-sm dark:prose-invert mt-0.5 max-w-none text-foreground break-words prose-p:leading-relaxed prose-pre:p-0"
                  />
                </div>
              );
            }
            if (msg.type === 'thinking') {
              return (
                <ThinkingBlock
                  key={msg.id}
                  messageId={msg.id}
                  content={msg.content}
                  isComplete={msg.isComplete}
                  isLive={activeThinkingMessageId === msg.id}
                  animateOnMount={!hydratedMessageIds.has(msg.id)}
                />
              );
            }
            if (msg.type === 'ui') {
              return (
                <div key={msg.id} className="space-y-4 ml-9">
                  {msg.schema.sections.map((section: UiSection) => (
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
            if (msg.type === 'error') {
              return (
                <div key={msg.id} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {msg.message}
                </div>
              );
            }
            return null;
          })}
        </div>

        {isGenerating && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-9 animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating...
          </div>
        )}
      </div>
    );
  };

  return (
    <AgenticShell
      projectId={projectId ?? ''}
      storageKey="training-messages"
      domainLockReason={trainingBlockedByFeGate ? "Training is locked until an approved feature engineering pipeline is available." : undefined}
      domainAdapter={createTrainingAdapter({
        projectId: projectId ?? '',
        datasetId: selectedTrainingFile?.metadata?.datasetId,
        targetColumn: trainingTargetColumn,
        featureSummary: buildFeatureSummary(),
        datasetFiles,
        documentFiles
      })}
      LeftPaneComponent={LeftPaneComponent}
      toolbarLeft={undefined}
      toolbarRight={
        projectFeatures.length > 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleGenerateFeatureCode} disabled={trainingBlockedByFeGate}>
                  <Wand2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Generate feature code</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : undefined
      }
    />
  );
}
