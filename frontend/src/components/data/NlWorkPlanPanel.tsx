import {
  ChevronDown,
  ChevronUp,
  GitMerge,
  ListChecks,
  Loader2,
  ShieldCheck,
  Sparkles,
  Table2,
  Wand2,
  type LucideIcon
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';

import type { NlProviderInfo, NlQueryExplanation } from '@/lib/api/query';
import { cn } from '@/lib/utils';
import { getPrimaryNlWorkPhase } from '@/lib/nlQuery/phaseStateMachine';
import type { NlModelWorkBlockState, NlWorkPhaseState } from '@/types/nlQuery';

import { TranscriptTimeline } from './TranscriptTimeline';
import {
  distanceFromViewportBottom,
  liveSubtitle,
  pluralize,
  scrollViewportToBottom,
  simplifyIntentSummary,
  splitValidationNotes,
  toneForWarningLevel
} from './nlWorkPlanUtils';

interface NlWorkPlanPanelProps {
  explanation?: NlQueryExplanation;
  provider?: NlProviderInfo | null;
  phase: 'submitting' | 'revealing' | 'reviewing';
  workPhases: NlWorkPhaseState[];
  modelWorkBlocks?: NlModelWorkBlockState[];
  isStreaming?: boolean;
  isExpanded: boolean;
  autoCollapsed: boolean;
  onToggleExpanded: () => void;
  className?: string;
}

type ViewportFadeState = {
  overflow: boolean;
  top: boolean;
  bottom: boolean;
};

function ProviderMark({ provider }: { provider?: NlProviderInfo | null }) {
  if (!provider) {
    return <span className="h-4 w-4" aria-hidden="true" />;
  }

  const iconClassName = 'h-4 w-4 shrink-0';

  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground"
      aria-label={`${provider.label} provider`}
      title={`${provider.label} · ${provider.model}`}
    >
      <Sparkles className={iconClassName} />
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  children,
  className
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border/70 bg-background/70 p-3', className)}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <p className="text-[11px] font-medium uppercase tracking-[0.12em]">{title}</p>
      </div>
      <div className="mt-2 text-sm leading-relaxed text-foreground/92">{children}</div>
    </section>
  );
}

function NlWorkPlanPanel({
  explanation,
  provider,
  phase,
  workPhases,
  modelWorkBlocks = [],
  isStreaming = false,
  isExpanded,
  onToggleExpanded,
  className
}: NlWorkPlanPanelProps) {
  const [visualExpanded, setVisualExpanded] = useState(isExpanded);
  const [transcriptExpanded, setTranscriptExpanded] = useState(phase !== 'reviewing');
  const [viewportFade, setViewportFade] = useState<ViewportFadeState>({
    overflow: false,
    top: false,
    bottom: false
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewportContentRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoFollowRef = useRef(true);
  const previousBlockSequenceRef = useRef(modelWorkBlocks.map((block) => block.blockId).join('|'));
  const pendingSmoothViewportHandoffRef = useRef(false);
  const active = useMemo(() => getPrimaryNlWorkPhase(workPhases), [workPhases]);
  const tone = toneForWarningLevel(explanation?.warningLevel ?? 'low');
  const isReviewMode = Boolean(explanation) && phase === 'reviewing';
  const transcriptVisible = !isReviewMode || transcriptExpanded;
  const { nonDebugValidationNotes, debugValidationNotes } = useMemo(
    () => splitValidationNotes(explanation?.validationNotes ?? []),
    [explanation]
  );
  const simplifiedIntent = explanation ? simplifyIntentSummary(explanation.intentSummary) : null;
  const transcriptSignature = useMemo(
    () => modelWorkBlocks.map((block) => `${block.blockId}:${block.status}:${block.content.length}`).join('|'),
    [modelWorkBlocks]
  );
  const blockSequenceSignature = useMemo(
    () => modelWorkBlocks.map((block) => block.blockId).join('|'),
    [modelWorkBlocks]
  );
  const shouldSmoothViewportHandoff = previousBlockSequenceRef.current.length > 0
    && previousBlockSequenceRef.current !== blockSequenceSignature;
  const phaseSignature = useMemo(
    () => workPhases.map((entry) => `${entry.phaseId}:${entry.status}:${entry.lastSummary ?? ''}`).join('|'),
    [workPhases]
  );
  const shouldKeepTranscriptLive = isStreaming || phase === 'revealing' || modelWorkBlocks.some((block) => block.status === 'streaming');
  const showLoadingSpinner = phase !== 'reviewing';
  const viewportMaskStyle = useMemo(() => ({
    '--nl-work-fade-top': viewportFade.top ? '24px' : '0px',
    '--nl-work-fade-bottom': viewportFade.bottom ? '20px' : '0px'
  }) as CSSProperties, [viewportFade.bottom, viewportFade.top]);

  const refreshViewportState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const overflow = viewport.scrollHeight - viewport.clientHeight > 8;
    const hiddenTop = viewport.scrollTop > 8;
    const hiddenBottomDistance = distanceFromViewportBottom(viewport);
    const hiddenBottom = hiddenBottomDistance > 8;

    setViewportFade((previous) => {
      if (
        previous.overflow === overflow
        && previous.top === hiddenTop
        && previous.bottom === hiddenBottom
      ) {
        return previous;
      }

      return {
        overflow,
        top: hiddenTop,
        bottom: hiddenBottom
      };
    });
  }, []);

  const handleViewportScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    shouldAutoFollowRef.current = distanceFromViewportBottom(viewport) <= 40;
    refreshViewportState();
  }, [refreshViewportState]);

  const followViewportToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    scrollViewportToBottom(viewport, behavior);
    refreshViewportState();
  }, [refreshViewportState]);

  useEffect(() => {
    setVisualExpanded(isExpanded);
  }, [isExpanded]);

  useEffect(() => {
    setTranscriptExpanded(phase !== 'reviewing');
  }, [phase]);

  useEffect(() => {
    refreshViewportState();
  }, [refreshViewportState, isExpanded, transcriptVisible, transcriptSignature, phaseSignature, blockSequenceSignature]);

  useEffect(() => {
    pendingSmoothViewportHandoffRef.current = shouldSmoothViewportHandoff;
  }, [shouldSmoothViewportHandoff]);

  useLayoutEffect(() => {
    if (!isExpanded || !transcriptVisible || !shouldKeepTranscriptLive || !shouldAutoFollowRef.current) {
      return;
    }

    const behavior = pendingSmoothViewportHandoffRef.current ? 'smooth' : 'auto';
    pendingSmoothViewportHandoffRef.current = false;
    previousBlockSequenceRef.current = blockSequenceSignature;
    followViewportToBottom(behavior);
  }, [
    isExpanded,
    transcriptVisible,
    shouldKeepTranscriptLive,
    transcriptSignature,
    phaseSignature,
    blockSequenceSignature,
    shouldSmoothViewportHandoff,
    followViewportToBottom
  ]);

  useEffect(() => {
    if (!isExpanded || !transcriptVisible || !shouldKeepTranscriptLive) {
      return;
    }

    const content = viewportContentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (shouldAutoFollowRef.current) {
        const behavior = pendingSmoothViewportHandoffRef.current ? 'smooth' : 'auto';
        pendingSmoothViewportHandoffRef.current = false;
        followViewportToBottom(behavior);
        return;
      }

      refreshViewportState();
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [
    followViewportToBottom,
    isExpanded,
    refreshViewportState,
    shouldSmoothViewportHandoff,
    shouldKeepTranscriptLive,
    transcriptVisible
  ]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border shadow-sm transition-colors duration-200',
        tone.container,
        className
      )}
      data-testid="nl-work-plan-panel"
    >
      <div className={cn('h-1 w-full', tone.accent)} />

      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="grid min-w-0 grid-cols-[auto,1fr] items-center gap-x-2 gap-y-1">
              <ProviderMark provider={provider} />
              <p className="text-sm font-semibold leading-none">
                {isReviewMode ? 'Review' : 'Live transcript'}
              </p>
              {!isReviewMode && (
                <>
                  <span aria-hidden="true" className="h-0 w-0" />
                  <p className="text-[12px] text-muted-foreground">
                    {liveSubtitle(active)}
                  </p>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleExpanded}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
            aria-label={isExpanded ? 'Collapse model work panel' : 'Expand model work panel'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
          visualExpanded
            ? 'grid-rows-[1fr] opacity-100'
            : 'pointer-events-none grid-rows-[0fr] opacity-0'
        )}
        aria-hidden={!visualExpanded}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            <div
              ref={viewportRef}
              className={cn(
                'nl-model-work-viewport scrollbar-thin space-y-3 overflow-y-auto pr-1',
                isReviewMode
                  ? 'max-h-[clamp(14rem,34vh,22rem)]'
                  : 'max-h-[clamp(12rem,28vh,18rem)]'
              )}
              data-testid="nl-model-work-viewport"
              data-overflow={viewportFade.overflow ? 'true' : 'false'}
              onScroll={handleViewportScroll}
              style={viewportMaskStyle}
            >
              <div ref={viewportContentRef} className="space-y-3">
                {isReviewMode && explanation && (
                  <>
                    <section className="grid gap-2 md:grid-cols-2">
                      <SummaryCard icon={Wand2} title="Intent" className="md:col-span-2">
                        <p>{simplifiedIntent}</p>
                      </SummaryCard>

                      <SummaryCard icon={Table2} title="Tables">
                        <p>
                          {explanation.selectedTables.length > 0
                            ? explanation.selectedTables.join(', ')
                            : 'No explicit table selection was reported.'}
                        </p>
                      </SummaryCard>

                      <SummaryCard icon={GitMerge} title="Joins">
                        {explanation.joinPlan.length > 0 ? (
                          <div className="space-y-1">
                            {explanation.joinPlan.slice(0, 3).map((join, idx) => (
                              <p key={`${join.leftTable}-${join.rightTable}-${idx}`}>
                                {join.leftTable}.{join.leftColumn} → {join.rightTable}.{join.rightColumn} ({join.joinType})
                              </p>
                            ))}
                            {explanation.joinPlan.length > 3 && (
                              <p className="text-xs text-muted-foreground">
                                +{explanation.joinPlan.length - 3} more join steps
                              </p>
                            )}
                          </div>
                        ) : (
                          <p>No join steps were required.</p>
                        )}
                      </SummaryCard>

                      <SummaryCard icon={ListChecks} title="Assumptions">
                        <p>
                          {pluralize('assumption', explanation.assumptions.length)}
                          {' • '}
                          {pluralize('validation note', nonDebugValidationNotes.length)}
                        </p>
                        {(explanation.assumptions.length > 0 || nonDebugValidationNotes.length > 0) && (
                          <details className="mt-2 rounded-lg border border-border/70 bg-background/65 p-2.5">
                            <summary className="cursor-pointer list-none text-xs font-medium text-foreground/90">
                              View details
                            </summary>
                            <div className="scrollbar-thin mt-2 max-h-36 space-y-2 overflow-y-auto pr-1 text-[12px] text-foreground/90">
                              {explanation.assumptions.map((item, index) => (
                                <p key={`assumption-${index}`}>{item}</p>
                              ))}
                              {nonDebugValidationNotes.map((item, index) => (
                                <p key={`validation-${index}`}>{item}</p>
                              ))}
                            </div>
                          </details>
                        )}
                      </SummaryCard>

                      <SummaryCard icon={ShieldCheck} title="Validation">
                        {nonDebugValidationNotes.length > 0 ? (
                          <div className="space-y-1">
                            {nonDebugValidationNotes.slice(0, 3).map((item, index) => (
                              <p key={`validation-note-${index}`}>{item}</p>
                            ))}
                            {nonDebugValidationNotes.length > 3 && (
                              <p className="text-xs text-muted-foreground">
                                +{nonDebugValidationNotes.length - 3} more validation notes
                              </p>
                            )}
                          </div>
                        ) : (
                          <p>No validation notes were reported.</p>
                        )}
                      </SummaryCard>
                    </section>

                    {debugValidationNotes.length > 0 && (
                      <details className="rounded-xl border border-border/70 bg-background/55 px-3 py-2.5">
                        <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground">
                          Debug details
                        </summary>
                        <div className="scrollbar-thin mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] leading-relaxed text-muted-foreground">
                          {debugValidationNotes.map((note, idx) => (
                            <p key={`${note}-${idx}`}>{note}</p>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}

                {isReviewMode ? (
                  <section className="rounded-xl border border-border/70 bg-background/55 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Transcript</p>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {modelWorkBlocks.length > 0
                            ? `${pluralize('block', modelWorkBlocks.length)} captured`
                            : 'No model transcript was captured.'}
                        </p>
                      </div>

                      {modelWorkBlocks.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setTranscriptExpanded((previous) => !previous)}
                          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={transcriptExpanded ? 'Hide transcript' : 'Show transcript'}
                        >
                          {transcriptExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {transcriptExpanded ? 'Hide transcript' : 'Show transcript'}
                        </button>
                      )}
                    </div>

                    {transcriptExpanded && (
                      <div className="mt-3 border-t border-border/70 pt-3">
                        <TranscriptTimeline
                          modelWorkBlocks={modelWorkBlocks}
                          active={active}
                          isLive={false}
                        />
                      </div>
                    )}
                  </section>
                ) : (
                  <TranscriptTimeline
                    modelWorkBlocks={modelWorkBlocks}
                    active={active}
                    isLive={shouldKeepTranscriptLive}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showLoadingSpinner && (
        <div className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

NlWorkPlanPanel.displayName = 'NlWorkPlanPanel';

export { NlWorkPlanPanel };
export type { NlWorkPlanPanelProps };
