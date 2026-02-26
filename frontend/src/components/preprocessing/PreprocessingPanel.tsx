import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { AgenticShell } from '@/components/agentic/AgenticShell';
import { createPreprocessingAdapter } from './PreprocessingAdapter';
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
import type { TransformationEvent } from '@/types/preprocessing';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Edit3,
  GitBranch,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
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
    replayReport,
    isLoadingTables,
    error: storeError,
    loadTables,
    selectDataset,
    approveStep,
    rejectStep,
    editStepCode,
    syncDivergence,
    evaluateReplayCompatibility,
    clearRun
  } = usePreprocessingStore();

  const [isDatasetModalOpen, setDatasetModalOpen] = useState(false);
  const [datasetSearch, setDatasetSearch] = useState('');
  const [candidateDatasetId, setCandidateDatasetId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState('');

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
    if (!selectedDatasetId && tables.length > 0) {
      setDatasetModalOpen(true);
      if (!candidateDatasetId) {
        setCandidateDatasetId(tables[0].datasetId);
      }
    }
  }, [candidateDatasetId, selectedDatasetId, tables]);

  useEffect(() => {
    syncDivergence(notebookCells);
  }, [notebookCells, syncDivergence]);

  const selectedTable = useMemo(
    () => tables.find((table) => table.datasetId === selectedDatasetId),
    [tables, selectedDatasetId]
  );

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

  const domainAdapter = useMemo(() => {
    return createPreprocessingAdapter(projectId ?? '', selectedDatasetId, tables);
  }, [projectId, selectedDatasetId, tables]);

  return (
    <>
      <AgenticShell
        projectId={projectId ?? ''}
        domainAdapter={domainAdapter}
        storageKey="preprocessing-messages"
        toolbarLeft={
          <>
            <WandSparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Agentic Preprocessing</span>
            {runId ? (
              <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
                Run {runId.slice(0, 10)}
              </Badge>
            ) : null}
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

            <Button variant="outline" size="sm" onClick={evaluateReplayCompatibility} disabled={!selectedDatasetId}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Replay Check
            </Button>
          </>
        }
        chatMetaSlot={
          <div className="hidden items-center gap-2 sm:flex">
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
        LeftPaneComponent={({ messages, isGenerating, error: shellError }) => (
          <div className="mx-auto w-full max-w-5xl space-y-4 p-6 pb-28">
            {storeError || shellError ? (
              <Card className="border-red-300 bg-red-50/80">
                <CardContent className="flex items-center gap-2 p-3 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  {storeError || shellError}
                </CardContent>
              </Card>
            ) : null}

            {!selectedDatasetId ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <Database className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Choose a dataset to start preprocessing</p>
                    <p className="text-xs text-muted-foreground">A first-time modal opens automatically for explicit context selection.</p>
                  </div>
                  <Button variant="outline" onClick={() => setDatasetModalOpen(true)}>Open dataset chooser</Button>
                </CardContent>
              </Card>
            ) : null}

            {sortedTimeline.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Transformation Timeline</h2>
                  <p className="text-xs text-muted-foreground">Cards are projected from structured tool events.</p>
                </div>
                {sortedTimeline.map((event) => {
                  const validationSummary = summarizeValidation(event);
                  const isEditing = editingStepId === event.stepId;

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
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Bound code</span>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => {
                                setEditingStepId(event.stepId);
                                setEditingCode(event.code ?? '');
                              }}>
                                <Edit3 className="mr-1 h-3 w-3" />
                                Edit
                              </Button>
                            </div>
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  className="h-32 w-full rounded-md border bg-background p-2 font-mono text-[11px]"
                                  value={editingCode}
                                  onChange={(inputEvent) => setEditingCode(inputEvent.target.value)}
                                />
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => setEditingStepId(null)}>Cancel</Button>
                                  <Button size="sm" onClick={() => {
                                    editStepCode(event.stepId, editingCode);
                                    setEditingStepId(null);
                                    setEditingCode('');
                                  }}>Save code</Button>
                                </div>
                              </div>
                            ) : (
                              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-background p-2 font-mono text-[11px]">
                                {event.code}
                              </pre>
                            )}
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

            {messages.length > 0 ? (
              <div className="space-y-2 mt-6">
                <h2 className="text-sm font-semibold">Assistant Notes</h2>
                {messages.map((message) => {
                  if (message.type !== 'assistant_text' && message.type !== 'user') return null;
                  return (
                    <Card key={message.id}>
                      <CardContent className={cn('p-3 text-sm', message.type === 'user' ? 'bg-primary/5' : '')}>
                        {message.type === 'assistant_text' ? (
                          <div className="max-w-none [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <Bot className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <span>{message.content}</span>
                          </div>
                        )}
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
        )}
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
                      {table.previewRows?.length ? (
                        <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 text-[10px]">
                          {JSON.stringify(table.previewRows[0], null, 2)}
                        </pre>
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
    </>
  );
}
