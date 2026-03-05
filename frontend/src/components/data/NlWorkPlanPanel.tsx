import { AlertTriangle, ChevronDown, ChevronUp, GitMerge, ListChecks, Table2, Wand2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactNode
} from 'react';

import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { cn } from '@/lib/utils';
import type { NlQueryExplanation } from '@/lib/api/query';
import {
  getNlWorkPhaseLabel,
  getPrimaryNlWorkPhase,
  type NlModelWorkBlockState,
  type NlWorkPhaseState
} from '@/types/nlQuery';

interface NlWorkPlanPanelProps {
  explanation?: NlQueryExplanation;
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
  statusText: string;
};

type BlockTone = {
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
        accent: 'bg-destructive',
        statusText: 'text-destructive'
      };
    case 'medium':
      return {
        container: 'border-amber-500/55 bg-amber-500/[0.08]',
        accent: 'bg-amber-500',
        statusText: 'text-amber-700 dark:text-amber-300'
      };
    case 'low':
      return {
        container: 'border-border/85 bg-card/90',
        accent: 'bg-border',
        statusText: 'text-foreground/85'
      };
    case 'none':
    default:
      return {
        container: 'border-emerald-500/50 bg-emerald-500/[0.08]',
        accent: 'bg-emerald-500',
        statusText: 'text-emerald-700 dark:text-emerald-300'
      };
  }
}

function reliabilityLabel(tier: NlQueryExplanation['reliabilityTier']): string {
  if (tier === 'high') return 'Reliability high';
  if (tier === 'medium') return 'Reliability medium';
  return 'Reliability low';
}

function riskLabel(level: NlQueryExplanation['warningLevel']): string {
  switch (level) {
    case 'high':
      return 'Risk high';
    case 'medium':
      return 'Risk medium';
    case 'low':
      return 'Risk low';
    case 'none':
    default:
      return 'Risk minimal';
  }
}

function modeNarrative(mode: NlQueryExplanation['confidenceMode']): string {
  switch (mode) {
    case 'model':
      return 'Model reasoning path';
    case 'heuristic':
      return 'Heuristic planning fallback';
    case 'repair':
      return 'Auto-repair path';
    case 'deterministic_fallback':
    default:
      return 'Deterministic fallback path';
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

function blockStatusCopy(status: NlModelWorkBlockState['status']): string {
  if (status === 'failed') {
    return 'Failed';
  }
  return status === 'completed' ? 'Captured' : 'Streaming';
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

function reviewLead(explanation: NlQueryExplanation): string {
  if (explanation.confidenceMode === 'model') {
    return `Confidence ${Math.round(explanation.confidence * 100)}%`;
  }
  if (explanation.confidenceMode === 'repair') {
    return 'Repair review';
  }
  if (explanation.confidenceMode === 'heuristic') {
    return 'Heuristic fallback review';
  }
  return 'Fallback review';
}

function reliabilityFactors(explanation: NlQueryExplanation): string[] {
  const factors: string[] = [];

  if (explanation.confidence < 0.72) {
    factors.push(`Confidence is only ${Math.round(explanation.confidence * 100)}%.`);
  }

  if (explanation.joinPlan.some((join) => join.confidence < 0.6)) {
    factors.push('One or more joins were inferred with low certainty.');
  }

  const riskyAssumptions = explanation.assumptions.filter((item) => (
    /(assum|infer|best guess|may |might |likely|unclear|unknown|approx|estimate)/i.test(item)
  ));
  if (riskyAssumptions.length > 0) {
    factors.push(`${riskyAssumptions.length} risky assumption${riskyAssumptions.length === 1 ? '' : 's'} detected.`);
  }

  if (explanation.confidenceMode === 'heuristic') {
    factors.push('Planning fell back to a heuristic path after model planning failed.');
  }

  if (explanation.confidenceMode === 'deterministic_fallback') {
    factors.push('SQL was recovered via deterministic fallback logic instead of a full model result.');
  }

  if (explanation.confidenceMode === 'repair') {
    factors.push('SQL was modified after an execution failure and should be reviewed carefully.');
  }

  if (factors.length === 0) {
    factors.push('No major ambiguity signals were detected in the final plan.');
  }

  return factors;
}

function blockTone(kind: NlModelWorkBlockState['kind']): BlockTone {
  switch (kind) {
    case 'thinking':
      return {
        badge: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
        card: 'border-sky-500/18 bg-sky-500/[0.045]',
        dot: 'bg-sky-500'
      };
    case 'tool':
      return {
        badge: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
        card: 'border-amber-500/18 bg-amber-500/[0.045]',
        dot: 'bg-amber-500'
      };
    case 'sql':
      return {
        badge: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
        card: 'border-emerald-500/18 bg-emerald-500/[0.045]',
        dot: 'bg-emerald-500'
      };
    case 'validation':
      return {
        badge: 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300',
        card: 'border-cyan-500/18 bg-cyan-500/[0.045]',
        dot: 'bg-cyan-500'
      };
    case 'repair':
      return {
        badge: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
        card: 'border-rose-500/18 bg-rose-500/[0.045]',
        dot: 'bg-rose-500'
      };
    case 'status':
      return {
        badge: 'bg-muted text-foreground/80',
        card: 'border-border/70 bg-background/65',
        dot: 'bg-muted-foreground/60'
      };
    case 'plan':
    default:
      return {
        badge: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
        card: 'border-violet-500/18 bg-violet-500/[0.045]',
        dot: 'bg-violet-500'
      };
  }
}

function blockKindLabel(kind: NlModelWorkBlockState['kind']): string {
  switch (kind) {
    case 'thinking':
      return 'Thinking';
    case 'tool':
      return 'Tool';
    case 'sql':
      return 'SQL';
    case 'validation':
      return 'Validation';
    case 'repair':
      return 'Repair';
    case 'status':
      return 'Status';
    case 'plan':
    default:
      return 'Plan';
  }
}

function transcriptBodyHeight(kind: NlModelWorkBlockState['kind']): string {
  switch (kind) {
    case 'thinking':
      return 'max-h-52';
    case 'tool':
      return 'max-h-44';
    case 'sql':
      return 'max-h-72';
    default:
      return 'max-h-64';
  }
}

function PlanInfoRow({
  icon: Icon,
  title,
  children
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
        {children}
      </div>
    </div>
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
  const tone = blockTone(block.kind);

  return (
    <li className="relative pl-5">
      {!isLast && (
        <span className="absolute left-[5px] top-5 bottom-[-12px] w-px bg-border/70" aria-hidden="true" />
      )}
      <span
        className={cn(
          'absolute left-0 top-3 h-2.5 w-2.5 rounded-full ring-4 ring-background/95',
          tone.dot
        )}
        aria-hidden="true"
      />
      <section
        className={cn(
          'rounded-xl border px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
          tone.card
        )}
        data-testid={`nl-model-work-block-${block.blockId}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]',
                  tone.badge
                )}
              >
                {blockKindLabel(block.kind)}
              </span>
              {block.phaseId && (
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {getNlWorkPhaseLabel(block.phaseId)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium leading-snug text-foreground/95">{block.title}</p>
          </div>
          <p className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {blockStatusCopy(block.status)}
          </p>
        </div>

        <div className={cn('scrollbar-thin mt-2 overflow-y-auto pr-1', transcriptBodyHeight(block.kind))}>
          <ProgressiveMessageText
            messageId={block.blockId}
            text={block.content || 'Waiting for streamed model output.'}
            isLive={isLive && block.status === 'streaming'}
            mode="markdown"
            showStreamingCaret={block.status === 'streaming'}
            className="nl-model-work-stream text-[12px] leading-relaxed text-foreground/90"
          />
        </div>
      </section>
    </li>
  );
}

function NlWorkPlanPanel({
  explanation,
  phase,
  workPhases,
  modelWorkBlocks = [],
  isStreaming = false,
  isExpanded,
  autoCollapsed,
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
  const shouldAutoFollowRef = useRef(true);
  const active = useMemo(() => getPrimaryNlWorkPhase(workPhases), [workPhases]);
  const { nonDebugValidationNotes, debugValidationNotes } = useMemo(
    () => splitValidationNotes(explanation?.validationNotes ?? []),
    [explanation]
  );
  const tone = toneForWarningLevel(explanation?.warningLevel ?? 'low');
  const isReviewMode = Boolean(explanation) && phase === 'reviewing';
  const ambiguousJoin = Boolean(explanation?.joinPlan.some((join) => join.confidence < 0.6));
  const simplifiedIntent = explanation ? simplifyIntentSummary(explanation.intentSummary) : null;
  const reliabilityNotes = useMemo(
    () => (explanation ? reliabilityFactors(explanation) : []),
    [explanation]
  );
  const transcriptSignature = useMemo(
    () => modelWorkBlocks.map((block) => `${block.blockId}:${block.status}:${block.content.length}`).join('|'),
    [modelWorkBlocks]
  );
  const phaseSignature = useMemo(
    () => workPhases.map((entry) => `${entry.phaseId}:${entry.status}:${entry.lastSummary ?? ''}`).join('|'),
    [workPhases]
  );
  const shouldKeepTranscriptLive = isStreaming || phase === 'revealing' || modelWorkBlocks.some((block) => block.status === 'streaming');
  const viewportMaskStyle = useMemo(() => ({
    '--nl-work-fade-top': viewportFade.top ? '26px' : '0px',
    '--nl-work-fade-bottom': viewportFade.bottom ? '22px' : '0px'
  }) as CSSProperties, [viewportFade.bottom, viewportFade.top]);

  const updateViewportState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const overflow = viewport.scrollHeight - viewport.clientHeight > 8;
    const hiddenTop = viewport.scrollTop > 8;
    const hiddenBottomDistance = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
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

    shouldAutoFollowRef.current = hiddenBottomDistance <= 40;
  }, []);

  useEffect(() => {
    setVisualExpanded(isExpanded);
  }, [isExpanded]);

  useEffect(() => {
    setTranscriptExpanded(phase !== 'reviewing');
  }, [phase]);

  useEffect(() => {
    updateViewportState();
  }, [updateViewportState, isExpanded, transcriptExpanded, transcriptSignature, phaseSignature]);

  useLayoutEffect(() => {
    if (!isExpanded || !transcriptExpanded || !shouldKeepTranscriptLive || !shouldAutoFollowRef.current) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
    updateViewportState();
  }, [
    isExpanded,
    transcriptExpanded,
    shouldKeepTranscriptLive,
    transcriptSignature,
    phaseSignature,
    updateViewportState
  ]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border shadow-sm transition-colors duration-200',
        tone.container,
        className
      )}
      data-testid="nl-work-plan-panel"
    >
      <div className={cn('h-1 w-full', tone.accent)} />

      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Model work</p>
            <p className="text-sm font-semibold leading-none">
              {isReviewMode ? 'Model review' : 'Live transcript'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {isReviewMode && explanation
                ? `${reviewLead(explanation)} • ${modeNarrative(explanation.confidenceMode)}`
                : `${getNlWorkPhaseLabel(active.phaseId)} • ${phaseStatusCopy(active.status).toLowerCase()}`}
            </p>
          </div>

          <div className="flex items-start gap-3">
            {isReviewMode && explanation && (
              <div className="text-right">
                <p className={cn('text-xs font-medium', tone.statusText)}>
                  {reliabilityLabel(explanation.reliabilityTier)}
                </p>
                <p className="text-[11px] text-muted-foreground">{riskLabel(explanation.warningLevel)}</p>
              </div>
            )}
            <button
              type="button"
              onClick={onToggleExpanded}
              className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              aria-label={isExpanded ? 'Collapse model work panel' : 'Expand model work panel'}
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {isExpanded ? 'Collapse' : autoCollapsed ? 'Expand' : 'Details'}
            </button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
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
              className="nl-model-work-viewport scrollbar-thin max-h-[46vh] space-y-3 overflow-y-auto pr-1"
              data-testid="nl-model-work-viewport"
              data-overflow={viewportFade.overflow ? 'true' : 'false'}
              onScroll={updateViewportState}
              style={viewportMaskStyle}
            >
              {!isReviewMode && (
                <section className="rounded-xl border border-border/70 bg-background/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Current step</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {phaseStatusCopy(active.status)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-medium text-foreground/95">
                    {getNlWorkPhaseLabel(active.phaseId)}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {active.lastSummary ?? 'Waiting for the next model step.'}
                  </p>
                </section>
              )}

              {isReviewMode && explanation && (
                <section className="space-y-3 rounded-xl border border-border/70 bg-background/65 p-3">
                  <PlanInfoRow icon={Wand2} title="Intent">
                    <p className="text-xs leading-relaxed text-foreground/90">{simplifiedIntent}</p>
                  </PlanInfoRow>

                  <PlanInfoRow icon={Table2} title="Tables">
                    <p className="text-xs leading-relaxed text-foreground/90">
                      {explanation.selectedTables.length > 0
                        ? explanation.selectedTables.join(', ')
                        : 'No explicit table selection was reported.'}
                    </p>
                  </PlanInfoRow>

                  <PlanInfoRow icon={GitMerge} title="Joins">
                    {explanation.joinPlan.length > 0 ? (
                      <div className="space-y-1 text-xs text-foreground/90">
                        {explanation.joinPlan.slice(0, 3).map((join, idx) => (
                          <p key={`${join.leftTable}-${join.rightTable}-${idx}`}>
                            {join.leftTable}.{join.leftColumn} → {join.rightTable}.{join.rightColumn} ({join.joinType})
                          </p>
                        ))}
                        {explanation.joinPlan.length > 3 && (
                          <p className="text-muted-foreground">
                            +{explanation.joinPlan.length - 3} more join steps
                          </p>
                        )}
                        {ambiguousJoin && (
                          <p className="text-amber-700 dark:text-amber-300">
                            One or more joins were inferred with low certainty.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-foreground/90">No join steps were required.</p>
                    )}
                  </PlanInfoRow>

                  <PlanInfoRow icon={ListChecks} title="Assumptions and validation">
                    <p className="text-xs text-foreground/90">
                      {pluralize('assumption', explanation.assumptions.length)}
                      {' • '}
                      {pluralize('validation note', nonDebugValidationNotes.length)}
                    </p>
                    {(explanation.assumptions.length > 0 || nonDebugValidationNotes.length > 0) && (
                      <details className="mt-2 rounded-lg border border-border/70 bg-background/65 p-2.5">
                        <summary className="cursor-pointer list-none text-xs font-medium text-foreground/90">
                          View details
                        </summary>
                        <div className="scrollbar-thin mt-2 max-h-40 space-y-2 overflow-y-auto pr-1 text-[11px] leading-relaxed text-foreground/90">
                          {explanation.assumptions.map((item, index) => (
                            <p key={`assumption-${index}`}>{item}</p>
                          ))}
                          {nonDebugValidationNotes.map((item, index) => (
                            <p key={`validation-${index}`}>{item}</p>
                          ))}
                        </div>
                      </details>
                    )}
                  </PlanInfoRow>

                  <PlanInfoRow icon={AlertTriangle} title="Reliability factors">
                    <div className="space-y-1 text-xs leading-relaxed text-foreground/90">
                      {reliabilityNotes.map((item, index) => (
                        <p key={`reliability-note-${index}`}>{item}</p>
                      ))}
                    </div>
                  </PlanInfoRow>

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

                  {explanation.warningLevel === 'high' && (
                    <div className="flex items-start gap-2 rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2.5 text-xs text-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
                      <p className="leading-relaxed">Review SQL and assumptions carefully before running.</p>
                    </div>
                  )}
                </section>
              )}

              <section className="rounded-xl border border-border/70 bg-background/55 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Transcript</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {modelWorkBlocks.length > 0
                        ? `${pluralize('block', modelWorkBlocks.length)} captured`
                        : 'No model transcript has been captured yet.'}
                    </p>
                  </div>
                  {isReviewMode && modelWorkBlocks.length > 0 && (
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

                {(transcriptExpanded || !isReviewMode) && (
                  <div className="mt-3">
                    {modelWorkBlocks.length > 0 ? (
                      <ol className="space-y-3">
                        {modelWorkBlocks.map((block, index) => (
                          <TranscriptBlock
                            key={block.blockId}
                            block={block}
                            isLive={shouldKeepTranscriptLive}
                            isLast={index === modelWorkBlocks.length - 1}
                          />
                        ))}
                      </ol>
                    ) : active.events.length > 0 ? (
                      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-foreground/90">Phase updates</p>
                          <p className="text-[11px] text-muted-foreground">{phaseStatusCopy(active.status)}</p>
                        </div>
                        <div className="scrollbar-thin mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 text-[11px] leading-relaxed text-muted-foreground">
                          {active.events.map((entry, index) => (
                            <p key={`${entry.phaseId}-${entry.timestamp}-${index}`}>{entry.summary}</p>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/70 bg-background/45 px-3 py-2 text-[11px] text-muted-foreground">
                        Streaming model output will appear here as the query is planned and generated.
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

NlWorkPlanPanel.displayName = 'NlWorkPlanPanel';

export { NlWorkPlanPanel };
export type { NlWorkPlanPanelProps };
