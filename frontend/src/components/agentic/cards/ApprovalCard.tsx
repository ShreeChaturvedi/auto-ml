/**
 * ApprovalCard - Displays an approval prompt with approve/reject controls.
 *
 * Shows a summary of completed work and transitions from interactive buttons
 * to a status badge once a decision is made.
 */

import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ApprovalCardProps {
  stepId: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  onApprove?: () => void;
  onReject?: () => void;
}

const STATUS_CONFIG = {
  approved: { label: 'Approved', variant: 'default' as const, borderClass: 'border-emerald-200 dark:border-emerald-800/40' },
  rejected: { label: 'Rejected', variant: 'destructive' as const, borderClass: 'border-destructive/30' },
  pending: { label: '', variant: 'secondary' as const, borderClass: '' },
};

export function ApprovalCard({
  stepId,
  title,
  status,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      data-step-id={stepId}
      className={cn(
        'rounded-md border bg-card p-3 shadow-sm dark:shadow-none',
        config.borderClass,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {status !== 'pending' && (
          <Badge variant={config.variant} className="shrink-0 text-[10px]">
            {config.label}
          </Badge>
        )}
      </div>

      {status === 'pending' && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={onApprove}>
            <ThumbsUp className="mr-1 h-3 w-3" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive"
            onClick={onReject}
          >
            <ThumbsDown className="mr-1 h-3 w-3" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
