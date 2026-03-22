import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Download, RefreshCcw, Clock, BarChart3, Microscope, Bug, History, Wand2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { IconModeToggle, type IconModeToggleOption } from '@/components/data/IconModeToggle';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useModelStore } from '@/stores/modelStore';
import { getModelArtifactUrl } from '@/lib/api/models';
import { PlotsTab } from './tabs/PlotsTab';
import { InterpretabilityTab } from './tabs/InterpretabilityTab';
import { ErrorsTab } from './tabs/ErrorsTab';
import { ProvenanceTab } from './tabs/ProvenanceTab';
import { TuneTab } from './tabs/TuneTab';
import { EvalTabContent } from './EvalTabContent';
import { formatMetric, formatDuration } from './utils';

const TAB_OPTIONS: IconModeToggleOption[] = [
  { value: 'plots', ariaLabel: 'Plots', icon: BarChart3, tooltip: 'Plots' },
  { value: 'interpretability', ariaLabel: 'Interpretability', icon: Microscope, tooltip: 'Interpretability' },
  { value: 'errors', ariaLabel: 'Errors', icon: Bug, tooltip: 'Errors' },
  { value: 'provenance', ariaLabel: 'Provenance', icon: History, tooltip: 'Provenance' },
  { value: 'tune', ariaLabel: 'Tune', icon: Wand2, tooltip: 'Tune' },
];

export interface ModelDetailPanelProps { modelId: string }

export function ModelDetailPanel({ modelId }: ModelDetailPanelProps) {
  const model = useModelStore((s) => s.models.find((m) => m.modelId === modelId));
  const evaluation = useExperimentsStore((s) => s.evaluations[modelId]);
  const fetchEvaluation = useExperimentsStore((s) => s.fetchEvaluation);
  const [activeTab, setActiveTab] = useState('plots');

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

      {/* Metrics */}
      <div className="flex items-center gap-3 border-b px-3 py-2.5 shrink-0">
        {metricEntries.length === 0 ? (
          <span className="text-xs text-muted-foreground">No metrics available</span>
        ) : (
          metricEntries.map(([key, value]) => (
            <div key={key} className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2.5 py-1">
              <span className="text-[11px] font-medium text-muted-foreground capitalize">{key}</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">{formatMetric(value)}</span>
            </div>
          ))
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-3 border-b px-3 h-10 shrink-0">
        <IconModeToggle
          value={activeTab}
          onValueChange={(v) => v && setActiveTab(v)}
          options={TAB_OPTIONS}
          className="h-8"
          itemClassName="h-7 w-7"
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          {activeTab === 'plots' && (
            <EvalTabContent {...evalProps} failedLabel="Basic metrics shown from training.">
              {(ev) => <PlotsTab evaluation={ev} />}
            </EvalTabContent>
          )}
          {activeTab === 'interpretability' && (
            <EvalTabContent {...evalProps} failedLabel="Interpretability analysis requires a successful evaluation.">
              {(ev) => <InterpretabilityTab modelId={modelId} evaluation={ev} />}
            </EvalTabContent>
          )}
          {activeTab === 'errors' && (
            <EvalTabContent {...evalProps} failedLabel="Error analysis requires a successful evaluation.">
              {(ev) => <ErrorsTab modelId={modelId} evaluation={ev} />}
            </EvalTabContent>
          )}
          {activeTab === 'provenance' && (
            <ProvenanceTab modelId={modelId} />
          )}
          {activeTab === 'tune' && (
            <TuneTab modelId={modelId} />
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
