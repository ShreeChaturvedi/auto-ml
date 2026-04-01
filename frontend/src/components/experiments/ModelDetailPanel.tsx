import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Download, RefreshCcw, Clock, X, BarChart3, Brain, AlertTriangle, GitBranch, SlidersHorizontal } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useModelStore } from '@/stores/modelStore';
import { getModelArtifactUrl } from '@/lib/api/models';
import { cn } from '@/lib/utils';
import { resolveModelIcon, TASK_TEXT_STYLES, TASK_LABELS, METRIC_ICONS } from './modelIcons';
import { IconModeToggle, type IconModeToggleOption } from '@/components/data/IconModeToggle';
import type { ExperimentDetailTab } from '@/types/experiments';
import { Pill } from '@/components/ui/pill';
import { PlotsTab } from './tabs/PlotsTab';
import { InterpretabilityTab } from './tabs/InterpretabilityTab';
import { ErrorsTab } from './tabs/ErrorsTab';
import { ProvenanceTab } from './tabs/ProvenanceTab';
import { TuneTab } from './tabs/tune/TuneTab';
import { EvalTabContent } from './EvalTabContent';
import { formatMetric, formatDurationCompact, formatDurationLong } from './utils';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';

const TAB_OPTIONS = [
  { value: 'plots', ariaLabel: 'Plots', icon: BarChart3, tooltip: 'Plots' },
  { value: 'interpretability', ariaLabel: 'Interpretability', icon: Brain, tooltip: 'Interpretability' },
  { value: 'errors', ariaLabel: 'Errors', icon: AlertTriangle, tooltip: 'Errors' },
  { value: 'provenance', ariaLabel: 'Provenance', icon: GitBranch, tooltip: 'Provenance' },
  { value: 'tune', ariaLabel: 'Tune', icon: SlidersHorizontal, tooltip: 'Tune' },
] as const satisfies readonly IconModeToggleOption<ExperimentDetailTab>[];

export interface ModelDetailPanelProps {
  modelId: string | null;
  open: boolean;
  onClose: () => void;
}

const iconBtnCls = 'h-7 w-7 rounded-md text-muted-foreground hover:text-foreground';
const ToolbarDivider = () => <div className="h-5 w-px bg-border/40 mx-1" />;

export function ModelDetailPanel({ modelId, open, onClose }: ModelDetailPanelProps) {
  const model = useModelStore((s) => modelId ? s.models.find((m) => m.modelId === modelId) : undefined);
  const evaluation = useExperimentsStore((s) => modelId ? s.evaluations[modelId] : undefined);
  const fetchEvaluation = useExperimentsStore((s) => s.fetchEvaluation);
  const retryEvaluation = useExperimentsStore((s) => s.retryEvaluation);
  const activeTab = useExperimentsStore((s) => modelId ? (s.activeDetailTab[modelId] ?? 'plots') : 'plots');
  const setActiveTab = useExperimentsStore((s) => s.setActiveDetailTab);
  const { themeColor } = useProjectThemeColor();

  useEffect(() => { if (modelId) fetchEvaluation(modelId); }, [modelId, fetchEvaluation]);
  useEffect(() => { if (modelId && !model) onClose(); }, [model, modelId, onClose]);

  if (!model || !modelId) return null;

  const { Icon: TaskIcon, colorClass } = resolveModelIcon(model.taskType);
  const evalStatus = model.evaluationStatus;
  const isComputing = evalStatus === 'computing';
  const isFailed = evalStatus === 'failed';
  const metricEntries = Object.entries(model.metrics);
  const evalProps = { isComputing, isFailed, evaluationError: model.evaluationError, evaluation };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="z-50 bg-black/70" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 origin-center
            w-[90vw] h-[85vh] bg-background border border-border/30 rounded-lg shadow-2xl
            flex flex-col overflow-hidden p-0
            ring-1 ring-white/[0.04]
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0
            data-[state=open]:zoom-in-[0.97] data-[state=closed]:zoom-out-[0.97]
            data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-1/2
            data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-1/2
            duration-200"
          onOpenAutoFocus={(e) => { e.preventDefault(); }}
        >
          <div
            className="h-[1px] w-full shrink-0"
            style={{
              background: themeColor
                ? `linear-gradient(90deg, transparent 0%, ${themeColor}60 30%, ${themeColor} 50%, ${themeColor}60 70%, transparent 100%)`
                : 'linear-gradient(90deg, transparent 0%, hsl(var(--muted-foreground) / 0.3) 50%, transparent 100%)',
            }}
          />

          <div className="flex h-14 items-center gap-3 border-b border-border/40 px-5 shrink-0">
            <TaskIcon className={cn('h-4 w-4 shrink-0', colorClass)} />
            <DialogTitle className="text-sm font-semibold truncate min-w-0">
              {model.name}
            </DialogTitle>
            <span className={cn('text-xs font-medium shrink-0', TASK_TEXT_STYLES[model.taskType])}>
              {TASK_LABELS[model.taskType]}
            </span>

            {(model.trainingMs != null || metricEntries.length > 0) && (
              <div className="h-8 w-px shrink-0 bg-gradient-to-b from-transparent via-border/60 to-transparent" />
            )}

            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
              {model.trainingMs != null && (
                <Pill icon={Clock} tooltip={`Training duration: ${formatDurationLong(model.trainingMs)}`} className="tabular-nums shrink-0">
                  {formatDurationCompact(model.trainingMs)}
                </Pill>
              )}
              {metricEntries.map(([key, value]) => (
                <Pill key={key} icon={METRIC_ICONS[key]} tooltip={`${key.charAt(0).toUpperCase() + key.slice(1)}: ${formatMetric(value)}`} className="tabular-nums shrink-0">
                  {formatMetric(value)}
                </Pill>
              ))}
            </div>

            <div className="flex items-center gap-1 ml-auto shrink-0">
              {(model.artifact || isFailed) && (
                <ToolbarDivider />
              )}

              {model.artifact && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={iconBtnCls} asChild>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className={iconBtnCls}
                      onClick={() => { void retryEvaluation(modelId); }}
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Retry evaluation</TooltipContent>
                </Tooltip>
              )}

              <ToolbarDivider />

              <IconModeToggle<ExperimentDetailTab>
                value={activeTab}
                onValueChange={(tab) => { setActiveTab(modelId, tab); }}
                options={TAB_OPTIONS}
              />

              <ToolbarDivider />

              <Button variant="ghost" size="icon" className={iconBtnCls} onClick={onClose}>
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0" role="tabpanel" id={`tabpanel-${modelId}`} aria-label={TAB_OPTIONS.find(t => t.value === activeTab)?.tooltip ?? 'Content'}>
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
