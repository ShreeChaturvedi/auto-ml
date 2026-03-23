import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Download, RefreshCcw, Clock, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useModelStore } from '@/stores/modelStore';
import { getModelArtifactUrl } from '@/lib/api/models';
import { cn } from '@/lib/utils';
import { resolveModelIcon, TASK_TEXT_STYLES, TASK_LABELS, METRIC_ICONS } from './modelIcons';
import { PlotsTab } from './tabs/PlotsTab';
import { InterpretabilityTab } from './tabs/InterpretabilityTab';
import { ErrorsTab } from './tabs/ErrorsTab';
import { ProvenanceTab } from './tabs/ProvenanceTab';
import { TuneTab } from './tabs/tune/TuneTab';
import { EvalTabContent } from './EvalTabContent';
import { formatMetric, formatDuration } from './utils';

const TABS = [
  { value: 'plots', label: 'Plots' },
  { value: 'interpretability', label: 'Interpretability' },
  { value: 'errors', label: 'Errors' },
  { value: 'provenance', label: 'Provenance' },
  { value: 'tune', label: 'Tune' },
];

export interface ModelDetailPanelProps {
  modelId: string | null;
  open: boolean;
  onClose: () => void;
}

export function ModelDetailPanel({ modelId, open, onClose }: ModelDetailPanelProps) {
  const model = useModelStore((s) => modelId ? s.models.find((m) => m.modelId === modelId) : undefined);
  const evaluation = useExperimentsStore((s) => modelId ? s.evaluations[modelId] : undefined);
  const fetchEvaluation = useExperimentsStore((s) => s.fetchEvaluation);
  const activeTab = useExperimentsStore((s) => modelId ? (s.activeDetailTab[modelId] ?? 'plots') : 'plots');
  const setActiveTab = useExperimentsStore((s) => s.setActiveDetailTab);

  useEffect(() => { if (modelId) fetchEvaluation(modelId); }, [modelId, fetchEvaluation]);
  useEffect(() => { if (modelId && !model) onClose(); }, [model, modelId, onClose]);

  if (!model || !modelId) {
    return (
      <Dialog open={false}>
        <DialogPortal><DialogOverlay className="bg-black/60" /></DialogPortal>
      </Dialog>
    );
  }

  const { Icon: TaskIcon, colorClass } = resolveModelIcon(model.taskType);
  const evalStatus = model.evaluationStatus;
  const isComputing = evalStatus === 'computing';
  const isFailed = evalStatus === 'failed';
  const metricEntries = Object.entries(model.metrics);
  const evalProps = { modelId, isComputing, isFailed, evaluationError: model.evaluationError, evaluation };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="z-40 bg-black/60" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 origin-center
            w-[90vw] h-[85vh] bg-popover border rounded-lg shadow-lg
            flex flex-col overflow-hidden p-0
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0
            data-[state=open]:zoom-in-[0.97] data-[state=closed]:zoom-out-[0.97]
            data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-1/2
            data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-1/2
            duration-200"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
          }}
        >
          {/* Row 1: Model info bar */}
          <div className="flex h-12 items-center gap-3 border-b px-4 shrink-0">
            <TaskIcon className={cn('h-4 w-4 shrink-0', colorClass)} />
            <DialogTitle className="text-sm font-semibold truncate min-w-0">
              {model.name}
            </DialogTitle>
            <span className={cn('text-xs font-medium shrink-0', TASK_TEXT_STYLES[model.taskType])}>
              {TASK_LABELS[model.taskType]}
            </span>

            {metricEntries.length > 0 && <div className="h-4 w-px shrink-0 bg-border" />}

            {metricEntries.length > 0 && (
              <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide min-w-0">
                {metricEntries.map(([key, value]) => {
                  const MetricIcon = METRIC_ICONS[key];
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" tabIndex={0}>
                          {MetricIcon && <MetricIcon className="h-3.5 w-3.5" />}
                          <span className="uppercase tracking-wide text-[10px]">{key}</span>
                          <span className="tabular-nums text-foreground">{formatMetric(value)}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent><span className="capitalize">{key}</span></TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}

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
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>

          {/* Row 2: Tab bar */}
          <div className="border-b px-4 shrink-0">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(modelId, v)}>
              <TabsList className="bg-transparent h-auto p-0 border-b-0 w-full justify-start gap-0">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs text-muted-foreground data-[state=active]:text-foreground px-3 py-2"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0">
            <ScrollArea key={modelId} className="h-full">
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
              {activeTab === 'provenance' && <ProvenanceTab modelId={modelId} />}
              {activeTab === 'tune' && <TuneTab modelId={modelId} />}
            </ScrollArea>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
