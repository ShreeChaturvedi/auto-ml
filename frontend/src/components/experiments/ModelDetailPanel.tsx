import { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
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
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';

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

/** Fixed reference width for transform-based tab indicator animation. */
const TAB_INDICATOR_REF_WIDTH = 1;

/** Animated underline tab indicator using compositor-only transforms. */
function TabIndicator({ containerRef, activeValue, themeColor }: { containerRef: React.RefObject<HTMLDivElement | null>; activeValue: string; themeColor: string | undefined }) {
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>(`[data-value="${activeValue}"]`);
    if (!active) { setStyle((s) => ({ ...s, opacity: 0 })); return; }
    const cRect = container.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    const offset = aRect.left - cRect.left;
    const ratio = aRect.width / TAB_INDICATOR_REF_WIDTH;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setStyle({
      width: TAB_INDICATOR_REF_WIDTH,
      transformOrigin: 'left',
      transform: `translateX(${offset}px) scaleX(${ratio})`,
      willChange: 'transform',
      opacity: 1,
      transition: prefersReducedMotion
        ? 'none'
        : 'transform 200ms cubic-bezier(.4,0,.2,1), opacity 150ms',
    });
  }, [containerRef, activeValue]);

  useLayoutEffect(() => {
    measure();
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <span
      aria-hidden
      className="tab-indicator absolute bottom-0 h-[2px] rounded-full"
      style={{ ...style, backgroundColor: themeColor ?? 'hsl(var(--foreground))' }}
    />
  );
}

export function ModelDetailPanel({ modelId, open, onClose }: ModelDetailPanelProps) {
  const model = useModelStore((s) => modelId ? s.models.find((m) => m.modelId === modelId) : undefined);
  const evaluation = useExperimentsStore((s) => modelId ? s.evaluations[modelId] : undefined);
  const fetchEvaluation = useExperimentsStore((s) => s.fetchEvaluation);
  const activeTab = useExperimentsStore((s) => modelId ? (s.activeDetailTab[modelId] ?? 'plots') : 'plots');
  const setActiveTab = useExperimentsStore((s) => s.setActiveDetailTab);
  const { themeColor } = useProjectThemeColor();
  const tabBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { if (modelId) fetchEvaluation(modelId); }, [modelId, fetchEvaluation]);
  useEffect(() => { if (modelId && !model) onClose(); }, [model, modelId, onClose]);

  if (!model || !modelId) {
    return (
      <Dialog open={false}>
        <DialogPortal><DialogOverlay className="bg-black/60 backdrop-blur-sm" /></DialogPortal>
      </Dialog>
    );
  }

  const { Icon: TaskIcon, colorClass } = resolveModelIcon(model.taskType);
  const evalStatus = model.evaluationStatus;
  const isComputing = evalStatus === 'computing';
  const isFailed = evalStatus === 'failed';
  const metricEntries = Object.entries(model.metrics);
  const evalProps = { isComputing, isFailed, evaluationError: model.evaluationError, evaluation };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="z-50 bg-black/70 backdrop-blur-sm" />
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
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
          }}
        >
          {/* Top accent line — project theme gradient */}
          <div
            className="h-[1px] w-full shrink-0"
            style={{
              background: themeColor
                ? `linear-gradient(90deg, transparent 0%, ${themeColor}60 30%, ${themeColor} 50%, ${themeColor}60 70%, transparent 100%)`
                : 'linear-gradient(90deg, transparent 0%, hsl(var(--muted-foreground) / 0.3) 50%, transparent 100%)',
            }}
          />

          {/* Row 1: Model info bar */}
          <div className="flex h-14 items-center gap-3 border-b border-border/40 px-5 shrink-0">
            <TaskIcon className={cn('h-4 w-4 shrink-0', colorClass)} />
            <DialogTitle className="text-sm font-semibold truncate min-w-0">
              {model.name}
            </DialogTitle>
            <span className={cn('text-xs font-medium shrink-0', TASK_TEXT_STYLES[model.taskType])}>
              {TASK_LABELS[model.taskType]}
            </span>

            {/* Gradient separator */}
            {metricEntries.length > 0 && (
              <div className="h-8 w-px shrink-0 bg-gradient-to-b from-transparent via-border/60 to-transparent" />
            )}

            {/* Metric chips */}
            {metricEntries.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide min-w-0">
                {metricEntries.map(([key, value]) => {
                  const MetricIcon = METRIC_ICONS[key];
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        <span
                          className="flex flex-col items-center gap-0.5 rounded-md bg-muted/20 px-2.5 py-1 cursor-default"
                          tabIndex={0}
                        >
                          <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground leading-none">
                            {MetricIcon && <MetricIcon className="h-3 w-3" />}
                            {key}
                          </span>
                          <span className="text-sm tabular-nums font-medium text-foreground leading-none">
                            {formatMetric(value)}
                          </span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent><span className="capitalize">{key}</span></TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}

            {/* Toolbar: duration + actions */}
            <div className="flex items-center gap-1 ml-auto shrink-0">
              {model.trainingMs != null && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap mr-1">
                  <Clock className="h-3 w-3" /> {formatDuration(model.trainingMs)}
                </span>
              )}

              {/* Divider before action buttons */}
              {(model.artifact || isFailed) && (
                <div className="h-5 w-px bg-border/40 mx-1" />
              )}

              {model.artifact && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground" asChild>
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
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground" onClick={() => {
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

              {/* Divider before close */}
              <div className="h-5 w-px bg-border/40 mx-1" />

              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>

          {/* Row 2: Underline tab bar */}
          <div className="border-b border-border/40 px-5 shrink-0">
            <div
              ref={tabBarRef}
              className="relative flex items-end gap-0"
              role="tablist"
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                const idx = TABS.findIndex((t) => t.value === activeTab);
                const next = e.key === 'ArrowRight'
                  ? (idx + 1) % TABS.length
                  : (idx - 1 + TABS.length) % TABS.length;
                setActiveTab(modelId, TABS[next].value);
                const btn = tabBarRef.current?.querySelector<HTMLElement>(`[data-value="${TABS[next].value}"]`);
                btn?.focus();
              }}
            >
              {TABS.map((t) => (
                <button
                  key={t.value}
                  id={`tab-${t.value}-${modelId}`}
                  role="tab"
                  data-value={t.value}
                  aria-selected={activeTab === t.value}
                  aria-controls={`tabpanel-${modelId}`}
                  tabIndex={activeTab === t.value ? 0 : -1}
                  onClick={() => setActiveTab(modelId, t.value)}
                  className={cn(
                    'relative px-3 py-2.5 text-xs font-medium transition-colors rounded-t-md',
                    'hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    activeTab === t.value
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/80',
                  )}
                >
                  {t.label}
                </button>
              ))}
              <TabIndicator containerRef={tabBarRef} activeValue={activeTab} themeColor={themeColor} />
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0" role="tabpanel" id={`tabpanel-${modelId}`} aria-labelledby={`tab-${activeTab}-${modelId}`}>
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
