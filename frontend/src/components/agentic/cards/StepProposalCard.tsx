/**
 * StepProposalCard - Displays a proposed pipeline step with accept/modify/reject controls.
 *
 * Shows a left accent bar colored by phase, a title, an expandable rationale,
 * and action buttons that collapse to a status badge once a decision is made.
 */

import { useState } from 'react';
import { Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const PHASE_ACCENT: Record<string, string> = {
  preprocessing: 'border-l-blue-500',
  feature_engineering: 'border-l-emerald-500',
  training: 'border-l-orange-500',
};

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  accepted: { label: 'Accepted', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  modified: { label: 'Modified', variant: 'secondary' },
};

export interface StepProposalCardProps {
  stepId: string;
  title: string;
  rationale?: string;
  phase: string;
  status: 'pending' | 'accepted' | 'rejected' | 'modified';
  onAccept?: () => void;
  onReject?: () => void;
}

export function StepProposalCard({
  stepId,
  title,
  rationale,
  phase,
  status,
  onAccept,
  onReject,
}: StepProposalCardProps) {
  const [rationaleExpanded, setRationaleExpanded] = useState(false);
  const accent = PHASE_ACCENT[phase] ?? 'border-l-muted-foreground';
  const badgeInfo = STATUS_BADGE[status];

  return (
    <div
      data-step-id={stepId}
      className={cn(
        'rounded-md border border-l-4 bg-card p-3 shadow-sm dark:shadow-none transition-colors',
        accent,
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

      {/* Action buttons (only when pending) */}
      {status === 'pending' && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={onAccept}>
            <Check className="mr-1 h-3 w-3" />
            Accept
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={onReject}>
            <X className="mr-1 h-3 w-3" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
