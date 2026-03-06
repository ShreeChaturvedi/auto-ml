import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  FileCode2,
  GitMerge,
  Info,
  ListChecks,
  Loader2,
  ShieldCheck,
  Sparkles,
  Table2,
  Wand2,
  Wrench,
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

import { GeminiIcon } from '@/components/icons/GeminiIcon';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import type { NlProviderInfo, NlQueryExplanation } from '@/lib/api/query';
import { cn } from '@/lib/utils';
import {
  getNlWorkPhaseLabel,
  getPrimaryNlWorkPhase,
  type NlModelWorkBlockState,
  type NlWorkPhaseState
} from '@/types/nlQuery';

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

type WarningTone = {
  container: string;
  accent: string;
};

type BlockAppearance = {
  label: string;
  icon: LucideIcon;
  badge: string;
  card: string;
  dot: string;
};

type ViewportFadeState = {
  overflow: boolean;
  top: boolean;
  bottom: boolean;
};

function toneForWarningLevel(level: NlQueryExplanation['warningLevel']): WarningTone {
  switch (level) {
    case 'high':
      return {
        container: 'border-destructive/55 bg-destructive/[0.08]',
        accent: 'bg-destructive'
      };
    case 'medium':
      return {
        container: 'border-amber-500/55 bg-amber-500/[0.08]',
        accent: 'bg-amber-500'
      };
    case 'low':
      return {
        container: 'border-border/85 bg-card/90',
        accent: 'bg-border'
      };
    case 'none':
    default:
      return {
        container: 'border-emerald-500/50 bg-emerald-500/[0.08]',
        accent: 'bg-emerald-500'
      };
  }
}

function simplifyIntentSummary(intentSummary: string): string {
  const trimmed = intentSummary.trim();
  if (!trimmed) {
    return 'No intent summary was returned.';
  }

  return trimmed
    .replace(/^heuristic plan for query:\s*/i, '')
    .replace(/^fallback plan for query:\s*/i, '')
    .replace(/^repair plan for query:\s*/i, '');
}

function phaseStatusCopy(status: NlWorkPhaseState['status']): string {
  switch (status) {
    case 'active':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'pending':
    default:
      return 'Pending';
  }
}

function liveSubtitle(active: NlWorkPhaseState): string {
  if (active.phaseId === 'done' && active.status === 'completed') {
    return active.lastSummary ?? 'Pipeline completed';
  }

  if (active.status === 'failed' && active.lastSummary) {
    return `${getNlWorkPhaseLabel(active.phaseId)} • ${active.lastSummary}`;
  }

  return `${getNlWorkPhaseLabel(active.phaseId)} • ${phaseStatusCopy(active.status).toLowerCase()}`;
}

function pluralize(word: string, count: number): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function splitValidationNotes(validationNotes: string[]) {
  const nonDebug: string[] = [];
  const debug: string[] = [];

  for (const note of validationNotes) {
    if (note.toLowerCase().startsWith('debug:')) {
      debug.push(note.replace(/^debug:\s*/i, '').trim());
      continue;
    }
    nonDebug.push(note);
  }

  return {
    nonDebugValidationNotes: nonDebug,
    debugValidationNotes: debug
  };
}


function blockAppearance(kind: NlModelWorkBlockState['kind']): BlockAppearance {
  switch (kind) {
    case 'thinking':
      return {
        label: 'Thinking',
        icon: Brain,
        badge: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
        card: 'border-sky-500/18 bg-sky-500/[0.04]',
        dot: 'bg-sky-500'
      };
    case 'tool':
      return {
        label: 'Tool call',
        icon: Wrench,
        badge: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
        card: 'border-amber-500/18 bg-amber-500/[0.04]',
        dot: 'bg-amber-500'
      };
    case 'sql':
      return {
        label: 'SQL',
        icon: FileCode2,
        badge: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
        card: 'border-emerald-500/18 bg-emerald-500/[0.04]',
        dot: 'bg-emerald-500'
      };
    case 'validation':
      return {
        label: 'Validation',
        icon: ShieldCheck,
        badge: 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300',
        card: 'border-cyan-500/18 bg-cyan-500/[0.04]',
        dot: 'bg-cyan-500'
      };
    case 'repair':
      return {
        label: 'Repair',
        icon: AlertTriangle,
        badge: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
        card: 'border-rose-500/18 bg-rose-500/[0.04]',
        dot: 'bg-rose-500'
      };
    case 'status':
      return {
        label: 'Status',
        icon: Info,
        badge: 'bg-muted text-foreground/80',
        card: 'border-border/70 bg-background/65',
        dot: 'bg-muted-foreground/60'
      };
    case 'plan':
    default:
      return {
        label: 'Plan',
        icon: Sparkles,
        badge: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
        card: 'border-violet-500/18 bg-violet-500/[0.04]',
        dot: 'bg-violet-500'
      };
  }
}

function transcriptBodyClass(kind: NlModelWorkBlockState['kind']): string {
  if (kind === 'thinking') {
    return 'max-h-44';
  }
  if (kind === 'tool') {
    return 'max-h-40';
  }
  if (kind === 'sql') {
    return 'max-h-36';
  }
  return 'max-h-32';
}

function distanceFromViewportBottom(element: HTMLElement): number {
  return element.scrollHeight - (element.scrollTop + element.clientHeight);
}

function scrollElementToBottom(element: HTMLElement) {
  element.scrollTop = element.scrollHeight;
}

function scheduleScrollToBottom(element: HTMLElement) {
  const run = () => {
    scrollElementToBottom(element);
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
    return;
  }

  run();
}

function scrollViewportToBottom(element: HTMLElement, behavior: ScrollBehavior = 'auto') {
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({
      top: element.scrollHeight,
      behavior
    });
    return;
  }

  scrollElementToBottom(element);
}

function ProviderMark({ provider }: { provider?: NlProviderInfo | null }) {
  if (!provider) {
    return <span className="h-4 w-4" aria-hidden="true" />;
  }

  const iconClassName = 'h-4 w-4 shrink-0';

  if (provider.id === 'gemini') {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center"
        aria-label={`${provider.label} provider`}
        title={`${provider.label} · ${provider.model}`}
      >
        <GeminiIcon className={iconClassName} />
      </span>
    );
  }

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

function TranscriptBlock({
  block,
  isLive,
  isLast
}: {
  block: NlModelWorkBlockState;
  isLive: boolean;
  isLast: boolean;
}) {
  const appearance = blockAppearance(block.kind);
  const Icon = appearance.icon;
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoFollowInnerRef = useRef(true);

  const followInnerTranscript = useCallback(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }

    scheduleScrollToBottom(body);
  }, []);

  const handleInnerScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }

    shouldAutoFollowInnerRef.current = distanceFromViewportBottom(body) <= 24;
  }, []);

  useLayoutEffect(() => {
    if (!isLive || block.status !== 'streaming' || !shouldAutoFollowInnerRef.current) {
      return;
    }

    const body = bodyRef.current;
    if (!body) {
      return;
    }

    scrollElementToBottom(body);
  }, [block.content, block.status, isLive]);

  return (
    <li className="relative pl-5">
      {!isLast && (
        <span className="absolute left-[6px] top-6 bottom-[-14px] w-px bg-border/70" aria-hidden="true" />
      )}
      <span
        className={cn(
          'absolute left-0 top-3 h-3 w-3 rounded-full ring-4 ring-background/95',
          appearance.dot
        )}
        aria-hidden="true"
      />

      <section
        className={cn(
          'rounded-xl border px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
          appearance.card
        )}
        data-testid={`nl-model-work-block-${block.blockId}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium', appearance.badge)}>
                <Icon className="h-3 w-3" />
                {appearance.label}
              </span>
              {block.phaseId && (
                <span className="text-[11px] text-muted-foreground">
                  {getNlWorkPhaseLabel(block.phaseId)}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-semibold leading-snug text-foreground/95">{block.title}</p>
          </div>

          {block.status === 'streaming' && (
            <span className="rounded-full border border-border/70 bg-background/70 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Live
            </span>
          )}
          {block.status === 'failed' && (
            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-destructive">
              Failed
            </span>
          )}
        </div>

        <div
          ref={bodyRef}
          className={cn(
            'scrollbar-thin mt-2 overflow-y-auto pr-1 text-foreground/90',
            transcriptBodyClass(block.kind)
          )}
          data-testid={`nl-model-work-block-body-${block.blockId}`}
          onScroll={handleInnerScroll}
        >
          <ProgressiveMessageText
            messageId={block.blockId}
            text={block.content || 'Waiting for streamed model output.'}
            isLive={isLive && block.status === 'streaming'}
            mode="markdown"
            showStreamingCaret={block.status === 'streaming'}
            onVisibleTextChange={() => {
              if (!shouldAutoFollowInnerRef.current) {
                return;
              }

              followInnerTranscript();
            }}
            className="nl-model-work-stream text-[12px] leading-relaxed"
          />
        </div>
      </section>
    </li>
  );
}

function TranscriptTimeline({
  modelWorkBlocks,
  active,
  isLive
}: {
  modelWorkBlocks: NlModelWorkBlockState[];
  active: NlWorkPhaseState;
  isLive: boolean;
}) {
  if (modelWorkBlocks.length > 0) {
    return (
      <ol className="space-y-3">
        {modelWorkBlocks.map((block, index) => (
          <TranscriptBlock
            key={block.blockId}
            block={block}
            isLive={isLive}
            isLast={index === modelWorkBlocks.length - 1}
          />
        ))}
      </ol>
    );
  }

  if (active.events.length > 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Phase updates</p>
        <div className="scrollbar-thin mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 text-[12px] leading-relaxed text-muted-foreground">
          {active.events.map((entry, index) => (
            <p key={`${entry.phaseId}-${entry.timestamp}-${index}`}>{entry.summary}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-background/45 px-3 py-2 text-[12px] text-muted-foreground">
      Streaming model output will appear here as the query is planned and generated.
    </div>
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
