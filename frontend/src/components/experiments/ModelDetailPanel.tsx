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
import { cn } from '@/lib/utils';
import { resolveModelIcon, TASK_BADGE_STYLES, TASK_LABELS } from './modelIcons';
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

  const { Icon: TaskIcon, colorClass } = resolveModelIcon(model.taskType);
  const evalStatus = model.evaluationStatus;
  const isComputing = evalStatus === 'computing';
  const isFailed = evalStatus === 'failed';
  const metricEntries = Object.entries(model.metrics);

  const evalProps = { modelId, isComputing, isFailed, evaluationError: model.evaluationError, evaluation };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Ribbon */}
      <div className="flex h-14 items-center gap-2 border-b px-3 shrink-0">
        {/* Left: icon + name + type badge */}
        <div className="flex min-w-0 shrink items-center gap-1.5">
          <TaskIcon className={cn('h-4 w-4 shrink-0', colorClass)} />
          <Tooltip>
            <TooltipTrigger asChild>
              <h2 className="text-sm font-semibold truncate min-w-0">{model.name}</h2>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{model.name}</p></TooltipContent>
          </Tooltip>
          <Badge
            variant="outline"
            className={cn('shrink-0 text-[10px]', TASK_BADGE_STYLES[model.taskType])}
          >
            {TASK_LABELS[model.taskType]}
          </Badge>
        </div>

        {metricEntries.length > 0 && <div className="h-4 w-px shrink-0 bg-border" />}

        {/* Metrics */}
        {metricEntries.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
            {metricEntries.map(([key, value]) => (
              <Badge
                key={key}
                variant="outline"
                className="gap-1 rounded-md whitespace-nowrap font-normal text-[10px] border-border/60 bg-muted/30 px-1.5 py-0"
              >
                <span className="text-muted-foreground capitalize">{key}</span>
                <span className="font-semibold tabular-nums text-foreground">{formatMetric(value)}</span>
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          {model.trainingMs != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap mr-1">
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
