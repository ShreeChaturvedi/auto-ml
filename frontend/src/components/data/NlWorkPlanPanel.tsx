import { AlertTriangle, ChevronDown, ChevronUp, GitMerge, ListChecks, Table2, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState, useMemo, type ComponentType, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { NlQueryExplanation } from '@/lib/api/query';
import {
  getNlWorkPhaseLabel,
  getPrimaryNlWorkPhase,
  type NlWorkPhaseState
} from '@/types/nlQuery';

interface NlWorkPlanPanelProps {
  explanation?: NlQueryExplanation;
  phase: 'submitting' | 'revealing' | 'reviewing';
  workPhases: NlWorkPhaseState[];
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
      return 'Heuristic planning path';
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

function compactSummary(explanation: NlQueryExplanation): string {
  if (explanation.confidenceMode === 'model') {
    return `Confidence ${Math.round(explanation.confidence * 100)}%`;
  }
  if (explanation.confidenceMode === 'repair') {
    return 'Repair reliability';
  }
  if (explanation.confidenceMode === 'heuristic') {
    return 'Heuristic reliability';
  }
  return 'Fallback reliability';
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
    <div className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-md border border-border/70 bg-background/70 px-2.5 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
        {children}
      </div>
    </div>
  );
}

function NlWorkPlanPanel({
  explanation,
  phase,
  workPhases,
  isExpanded,
  autoCollapsed,
  onToggleExpanded,
  className
}: NlWorkPlanPanelProps) {
  const [visualExpanded, setVisualExpanded] = useState(false);
  const expandFrameRef = useRef<number | null>(null);
  const isReview = phase === 'reviewing' && Boolean(explanation);
  const active = useMemo(() => getPrimaryNlWorkPhase(workPhases), [workPhases]);
  const { nonDebugValidationNotes, debugValidationNotes } = useMemo(
    () => splitValidationNotes(explanation?.validationNotes ?? []),
    [explanation]
  );

  const tone = toneForWarningLevel(explanation?.warningLevel ?? 'low');
  const ambiguousJoin = Boolean(explanation?.joinPlan.some((join) => join.confidence < 0.6));
  const simplifiedIntent = explanation ? simplifyIntentSummary(explanation.intentSummary) : null;

  useEffect(() => {
    if (expandFrameRef.current !== null) {
      window.cancelAnimationFrame(expandFrameRef.current);
      expandFrameRef.current = null;
    }

    if (isExpanded) {
      // Animate expand even on first mount by moving to expanded state on the next frame.
      expandFrameRef.current = window.requestAnimationFrame(() => {
        setVisualExpanded(true);
        expandFrameRef.current = null;
      });
      return;
    }

    setVisualExpanded(false);
  }, [isExpanded]);

  useEffect(() => {
    return () => {
      if (expandFrameRef.current !== null) {
        window.cancelAnimationFrame(expandFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border shadow-sm',
        tone.container,
        'transition-colors duration-200',
        className
      )}
      data-testid="nl-work-plan-panel"
    >
      <div className={cn('h-1 w-full', tone.accent)} />

      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Model work</p>
            {isReview && explanation ? (
              <p className="text-sm font-semibold leading-none">{compactSummary(explanation)}</p>
            ) : (
              <p className="text-sm font-semibold leading-none">{getNlWorkPhaseLabel(active.phaseId)}</p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {isReview && explanation
                ? modeNarrative(explanation.confidenceMode)
                : `${phaseStatusCopy(active.status)}${active.lastSummary ? ` • ${active.lastSummary}` : ''}`}
            </p>
          </div>

          <div className="flex items-start gap-2">
            {isReview && explanation && (
              <div className="text-right">
                <p className={cn('text-xs font-medium', tone.statusText)}>{reliabilityLabel(explanation.reliabilityTier)}</p>
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
            : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        )}
        aria-hidden={!visualExpanded}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
          {!isReview && (
            <div className="space-y-2 rounded-md border border-border/70 bg-background/55 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground/90">{getNlWorkPhaseLabel(active.phaseId)}</p>
                <p className="text-[11px] text-muted-foreground">{phaseStatusCopy(active.status)}</p>
              </div>
              <p className="text-xs text-foreground/90">{active.lastSummary ?? 'Waiting for the next model step.'}</p>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border/70 bg-background/70 p-2 text-[11px] text-muted-foreground">
                {active.events.length > 0 ? (
                  active.events.map((entry, index) => (
                    <p key={`${entry.phaseId}-${entry.timestamp}-${index}`}>
                      {entry.summary}
                    </p>
                  ))
                ) : (
                  <p>Streaming status will appear here.</p>
                )}
              </div>
            </div>
          )}

          {isReview && explanation && (
            <div className="space-y-2">
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
                    {explanation.joinPlan.slice(0, 2).map((join, idx) => (
                      <p key={`${join.leftTable}-${join.rightTable}-${idx}`}>
                        {join.leftTable}.{join.leftColumn} → {join.rightTable}.{join.rightColumn} ({join.joinType})
                      </p>
                    ))}
                    {explanation.joinPlan.length > 2 && (
                      <p className="text-muted-foreground">+{explanation.joinPlan.length - 2} more join steps</p>
                    )}
                    {ambiguousJoin && (
                      <p className="text-amber-700 dark:text-amber-300">One or more joins were inferred with low certainty.</p>
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
                  <details className="mt-2 rounded-md border border-border/70 bg-background/65 p-2">
                    <summary className="cursor-pointer list-none text-xs font-medium text-foreground/90">
                      View details
                    </summary>
                    <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1 text-[11px] leading-relaxed text-foreground/90">
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

              {debugValidationNotes.length > 0 && (
                <details className="rounded-md border border-border/70 bg-background/55 px-2.5 py-2">
                  <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground">
                    Debug details
                  </summary>
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] leading-relaxed text-muted-foreground">
                    {debugValidationNotes.map((note, idx) => (
                      <p key={`${note}-${idx}`}>{note}</p>
                    ))}
                  </div>
                </details>
              )}

              {explanation.warningLevel === 'high' && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-2 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
                  <p className="leading-relaxed">Review SQL and assumptions carefully before running.</p>
                </div>
              )}
            </div>
          )}
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
