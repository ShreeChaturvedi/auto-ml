import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Download, RefreshCcw, Clock, BarChart3, Microscope, Bug, History, Wand2, HelpCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useModelStore } from '@/stores/modelStore';
import { getModelArtifactUrl } from '@/lib/api/models';
import { fetchInsights } from '@/lib/api/experiments';
import { readNdjsonStream } from '@/lib/api/streamReader';
import { PlotsTab } from './tabs/PlotsTab';
import { InterpretabilityTab } from './tabs/InterpretabilityTab';
import { ErrorsTab } from './tabs/ErrorsTab';
import { ProvenanceTab } from './tabs/ProvenanceTab';
import { TuneTab } from './tabs/TuneTab';
import { EvalTabContent } from './EvalTabContent';
import { formatMetric, formatDuration } from './utils';
import { EvalStatusBadge } from './EvalStatusBadge';

function ExplainButton({ metricKey, metricValue, model }: {
  metricKey: string; metricValue: number; model: { modelId: string; name: string; algorithm: string; taskType: string; metrics: Record<string, number> };
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const [text, setText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleExplain = useCallback(async () => {
    if (text !== null) { setIsOpen((v) => !v); return; }
    setIsOpen(true);
    setIsLoading(true);
    try {
      const response = await fetchInsights(projectId ?? '', {
        type: 'explain',
        context: { metric: metricKey, value: metricValue, model: { name: model.name, algorithm: model.algorithm, taskType: model.taskType, metrics: model.metrics } },
      });
      let accumulated = '';
      for await (const event of readNdjsonStream<{ type: string; content?: string }>(response)) {
        if (event.type === 'token' && event.content) { accumulated += event.content; setText(accumulated); }
        if (event.type === 'error') { setText('Explanation unavailable'); break; }
      }
      if (!accumulated) setText('Explanation unavailable');
    } catch {
      setText('Explanation unavailable');
    } finally {
      setIsLoading(false);
    }
  }, [metricKey, metricValue, model, projectId, text]);

  return (
    <span className="inline-flex flex-col">
      <button onClick={handleExplain} className="ml-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors" title="Explain this metric">
        <HelpCircle className="h-3 w-3" />
      </button>
      {isOpen && (
        <span className="text-[11px] text-muted-foreground leading-snug mt-1 max-w-[240px]">
          {isLoading && !text ? <span className="animate-pulse">Explaining...</span> : text}
        </span>
      )}
    </span>
  );
}

export interface ModelDetailPanelProps { modelId: string }

export function ModelDetailPanel({ modelId }: ModelDetailPanelProps) {
  const model = useModelStore((s) => s.models.find((m) => m.modelId === modelId));
  const evaluation = useExperimentsStore((s) => s.evaluations[modelId]);
  const fetchEvaluation = useExperimentsStore((s) => s.fetchEvaluation);

  useEffect(() => { fetchEvaluation(modelId); }, [modelId, fetchEvaluation]);

  if (!model) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Model not found.</p>
      </div>
    );
  }

  const evalStatus = model.evaluationStatus;
  const isComputing = evalStatus === 'computing';
  const isFailed = evalStatus === 'failed';
  const metricEntries = Object.entries(model.metrics);

  const evalProps = { modelId, isComputing, isFailed, evaluationError: model.evaluationError, evaluation };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Ribbon */}
      <div className="flex h-14 items-center justify-between gap-3 border-b px-3 shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold truncate">{model.name}</h2>
          <Badge variant="secondary" className="text-[10px] shrink-0">{model.algorithm}</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {model.trainingMs != null && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" /> {formatDuration(model.trainingMs)}
            </span>
          )}
          {model.artifact && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <a href={getModelArtifactUrl(model.modelId)} download>
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download .joblib</TooltipContent>
            </Tooltip>
          )}
          {isFailed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                  useExperimentsStore.setState((s) => {
                    const next = { ...s.evaluations };
                    delete next[modelId];
                    return { evaluations: next };
                  });
                  fetchEvaluation(modelId);
                }}>
                  <RefreshCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retry evaluation</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Metrics strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2 shrink-0">
        {metricEntries.length === 0 ? (
          <span className="text-xs text-muted-foreground">No metrics available</span>
        ) : (
          metricEntries.map(([key, value]) => (
            <div key={key} className="flex items-baseline gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{key}</span>
              <span className="text-sm font-bold text-foreground tabular-nums metric-counter">{formatMetric(value)}</span>
              <ExplainButton metricKey={key} metricValue={value} model={model} />
            </div>
          ))
        )}
        <EvalStatusBadge status={evalStatus} compact />
      </div>

      {/* Tab Navigation */}
      <Tabs defaultValue="plots" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="plots" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Plots
          </TabsTrigger>
          <TabsTrigger value="interpretability" className="gap-1.5">
            <Microscope className="h-3.5 w-3.5" />
            Interpretability
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5">
            <Bug className="h-3.5 w-3.5" />
            Errors
          </TabsTrigger>
          <TabsTrigger value="provenance" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Provenance
          </TabsTrigger>
          <TabsTrigger value="tune" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            Tune
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plots" className="flex-1">
          <ScrollArea className="h-full">
            <EvalTabContent {...evalProps} failedLabel="Basic metrics shown from training.">
              {(ev) => <PlotsTab evaluation={ev} />}
            </EvalTabContent>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="interpretability" className="flex-1">
          <ScrollArea className="h-full">
            <EvalTabContent {...evalProps} failedLabel="Interpretability analysis requires a successful evaluation.">
              {(ev) => <InterpretabilityTab modelId={modelId} evaluation={ev} />}
            </EvalTabContent>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="errors" className="flex-1">
          <ScrollArea className="h-full">
            <EvalTabContent {...evalProps} failedLabel="Error analysis requires a successful evaluation.">
              {(ev) => <ErrorsTab modelId={modelId} evaluation={ev} />}
            </EvalTabContent>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="provenance" className="flex-1">
          <ScrollArea className="h-full">
            <ProvenanceTab modelId={modelId} />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="tune" className="flex-1">
          <ScrollArea className="h-full">
            <TuneTab modelId={modelId} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
