/**
 * WorkPlanCard - Review-mode summary cards for NL query explanation.
 *
 * Extracted from NlWorkPlanPanel to isolate the review content rendering.
 * Displays intent, tables, joins, assumptions, and validation details.
 */

import {
  GitMerge,
  ListChecks,
  ShieldCheck,
  Table2,
  Wand2,
  type LucideIcon
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { NlQueryExplanation } from '@/lib/api/query';
import { cn } from '@/lib/utils';
import { pluralize, simplifyIntentSummary, splitValidationNotes } from './nlWorkPlanUtils';

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

export interface WorkPlanCardProps {
  explanation: NlQueryExplanation;
}

export function WorkPlanCard({ explanation }: WorkPlanCardProps) {
  const { nonDebugValidationNotes, debugValidationNotes } = splitValidationNotes(
    explanation.validationNotes ?? []
  );
  const simplifiedIntent = simplifyIntentSummary(explanation.intentSummary);

  return (
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
              <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1 text-[12px] text-foreground/90">
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
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] leading-relaxed text-muted-foreground">
            {debugValidationNotes.map((note, idx) => (
              <p key={`${note}-${idx}`}>{note}</p>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
