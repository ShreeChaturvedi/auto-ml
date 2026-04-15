/**
 * StepProposalCard — displays a proposed pipeline step with selection controls.
 *
 * Phase identity reads through the header icon tint only (preprocessing →
 * sky, feature_engineering → emerald, training → orange); the card border
 * stays neutral. `ProposalActionButton` pairs provide accept / reject
 * controls — selecting "Accept" adopts the same tone as
 * `StatusPill status="accepted"`, and selecting "Reject" adds a
 * strikethrough so the "this step will be skipped" read is immediate.
 */

import { useEffect, useRef, useState } from 'react';
import { FlaskConical, Pencil } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ToolCardShell } from '@/components/llm/shared/ToolCardShell';
import { ProposalActionButton } from '@/components/llm/shared/ProposalActionButton';
import type { StatusKind } from '@/components/llm/shared/StatusPill';

/**
 * Phase → icon tint. Keys match the underscore convention emitted by
 * `useLifecycleCards.ts detectPhase()`. If that helper ever switches
 * to the canonical hyphenated `Phase` union in `types/phase.ts`, update
 * this map in lockstep.
 */
const PHASE_ICON_CLASS: Record<string, string> = {
  preprocessing: 'text-sky-600 dark:text-sky-400',
  feature_engineering: 'text-emerald-600 dark:text-emerald-400',
  training: 'text-orange-600 dark:text-orange-400',
};

function phaseIconClass(phase: string): string {
  return PHASE_ICON_CLASS[phase] ?? 'text-muted-foreground';
}

/** User's selection intent, independent of the tool-call's own lifecycle status. */
type UserChoice = 'accepted' | 'rejected' | 'untouched';

type EffectiveStatus =
  | 'pending'
  | 'selected'
  | 'deselected'
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'modified';

function effectiveStatus(
  propStatus: StepProposalCardProps['status'],
  choice: UserChoice,
): EffectiveStatus {
  if (propStatus !== 'pending') return propStatus;
  if (choice === 'accepted') return 'selected';
  if (choice === 'rejected') return 'deselected';
  return 'pending';
}

function getPillProps(status: EffectiveStatus): {
  status: StatusKind;
  label?: string;
  icon?: LucideIcon | null;
} {
  switch (status) {
    case 'selected':  return { status: 'selected' };
    case 'accepted':  return { status: 'accepted' };
    case 'deselected':
    case 'rejected':  return { status: 'skipped' };
    case 'pending':   return { status: 'awaiting', label: 'awaiting approval' };
    case 'modified':  return { status: 'info', label: 'modified', icon: Pencil };
    case 'proposed':
    default:          return { status: 'pending', label: 'proposed' };
  }
}

export interface StepProposalCardProps {
  stepId: string;
  title: string;
  rationale?: string;
  phase: string;
  status: 'pending' | 'proposed' | 'accepted' | 'rejected' | 'modified';
  onToggleSelect?: (selected: boolean) => void;
  selectedOverride?: boolean | null;
}

export function StepProposalCard({
  stepId,
  title,
  rationale,
  phase,
  status,
  onToggleSelect,
  selectedOverride,
}: StepProposalCardProps) {
  // Auto-select pending proposals so the shared "Apply" button is immediately
  // visible. User can still deselect (Skip) ones they don't want.
  const [choice, setChoice] = useState<UserChoice>(
    () => (status === 'pending' ? 'accepted' : 'untouched'),
  );

  // Notify parent exactly once per mount that we auto-selected — guarded by
  // a ref so re-renders (and eslint-exhaustive-deps) never cause duplicate fires.
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (typeof selectedOverride === 'boolean') {
      setChoice(selectedOverride ? 'accepted' : 'rejected');
      return;
    }
    if (selectedOverride === null) {
      setChoice('untouched');
      return;
    }
    if (notifiedRef.current) return;
    if (status === 'pending') {
      notifiedRef.current = true;
      onToggleSelect?.(true);
    }
  }, [selectedOverride, status, onToggleSelect]);

  // `onToggleSelect(accepted: boolean)` tells the parent whether the step is
  // currently flagged "apply". Reject always reports false (whether the user
  // just selected reject, or cleared a prior reject — neither means "apply").
  const toggleAccept = () => {
    const next: UserChoice = choice === 'accepted' ? 'untouched' : 'accepted';
    setChoice(next);
    onToggleSelect?.(next === 'accepted');
  };
  const toggleReject = () => {
    const next: UserChoice = choice === 'rejected' ? 'untouched' : 'rejected';
    setChoice(next);
    onToggleSelect?.(false);
  };

  const pillProps = getPillProps(effectiveStatus(status, choice));
  const isToggleable = status === 'pending';

  const actionRow = isToggleable ? (
    <div className="mt-3 flex items-center gap-2">
      <ProposalActionButton
        variant="accept"
        selected={choice === 'accepted'}
        onClick={toggleAccept}
      />
      <ProposalActionButton
        variant="reject"
        selected={choice === 'rejected'}
        onClick={toggleReject}
      />
    </div>
  ) : null;

  return (
    <ToolCardShell
      data-step-id={stepId}
      icon={FlaskConical}
      iconClassName={phaseIconClass(phase)}
      title={title}
      status={pillProps.status}
      statusLabel={pillProps.label}
      expandable={!!rationale}
    >
      {rationale ? (
        <div className="px-3 py-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {rationale}
          </p>
          {actionRow}
        </div>
      ) : actionRow ? (
        <div className="px-3 py-2">{actionRow}</div>
      ) : null}
    </ToolCardShell>
  );
}
