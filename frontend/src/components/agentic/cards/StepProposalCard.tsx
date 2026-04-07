/**
 * StepProposalCard - Displays a proposed pipeline step with selection controls.
 *
 * Shows a left accent bar colored by phase, a title, an expandable rationale,
 * and a toggle to select/deselect. When multiple proposals are shown, the user
 * selects which ones to approve, then clicks a shared "Apply" button.
 */

import { useEffect, useState } from 'react';
import { Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const PHASE_ACCENT: Record<string, string> = {
  preprocessing: 'border-l-blue-500',
  feature_engineering: 'border-l-emerald-500',
  training: 'border-l-orange-500',
};

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  pending: { label: 'Awaiting Approval', variant: 'secondary' },
  selected: { label: 'Selected', variant: 'default' },
  deselected: { label: 'Skipped', variant: 'destructive' },
  proposed: { label: 'Proposed', variant: 'secondary' },
  accepted: { label: 'Accepted', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  modified: { label: 'Modified', variant: 'secondary' },
};

export interface StepProposalCardProps {
  stepId: string;
  title: string;
  rationale?: string;
  phase: string;
  status: 'pending' | 'proposed' | 'accepted' | 'rejected' | 'modified';
  onToggleSelect?: (selected: boolean) => void;
}

export function StepProposalCard({
  stepId,
  title,
  rationale,
  phase,
  status,
  onToggleSelect,
}: StepProposalCardProps) {
  const [rationaleExpanded, setRationaleExpanded] = useState(false);
  // Auto-select pending proposals so the "Apply" button is immediately visible.
  // User can deselect (Skip) ones they don't want.
  const [selected, setSelected] = useState<boolean | null>(status === 'pending' ? true : null);

  // Notify parent of auto-selection on mount
  useEffect(() => {
    if (status === 'pending' && onToggleSelect) {
      onToggleSelect(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Determine effective display status
  const effectiveStatus = selected === true
    ? 'selected'
    : selected === false
      ? 'deselected'
      : status;
  const accent = PHASE_ACCENT[phase] ?? 'border-l-muted-foreground';
  const badgeInfo = STATUS_BADGE[effectiveStatus];
  const isToggleable = status === 'pending';

  return (
    <div
      data-step-id={stepId}
      className={cn(
        'rounded-md border border-l-4 bg-card p-3 shadow-sm dark:shadow-none transition-colors',
        accent,
        isToggleable && selected === true && 'ring-1 ring-primary/40',
        isToggleable && selected === false && 'opacity-50',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {badgeInfo && (
          <Badge variant={badgeInfo.variant} className="shrink-0 text-[10px]">
            {badgeInfo.label}
          </Badge>
        )}
      </div>

      {/* Expandable rationale */}
      {rationale && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setRationaleExpanded(!rationaleExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          >
            {rationaleExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Rationale
          </button>
          {rationaleExpanded && (
            <p className="mt-1 pl-4 text-xs leading-relaxed text-muted-foreground">
              {rationale}
            </p>
          )}
        </div>
      )}

      {/* Toggle buttons for selection */}
      {isToggleable && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = selected === true ? null : true;
              setSelected(next);
              onToggleSelect?.(next === true);
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              selected === true
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Check className="h-3 w-3" />
            {selected === true ? 'Selected' : 'Select'}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = selected === false ? null : false;
              setSelected(next);
              onToggleSelect?.(false);
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              selected === false
                ? 'bg-destructive/10 text-destructive'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <X className="h-3 w-3" />
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
