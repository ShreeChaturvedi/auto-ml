/**
 * CommitBadge - Compact one-liner for completed/committed steps.
 *
 * Shows a checkmark icon and step name. Clicking expands to reveal
 * full step details when provided.
 */

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommitBadgeProps {
  title: string;
  details?: string;
}

export function CommitBadge({ title, details }: CommitBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!details;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded(!expanded)}
        disabled={!hasDetails}
        className={cn(
          'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          hasDetails && 'hover:bg-muted/50 cursor-pointer',
          !hasDetails && 'cursor-default',
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span className="flex-1 text-xs font-medium text-foreground">{title}</span>
        {hasDetails && (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )
        )}
      </button>

      {expanded && details && (
        <div className="ml-6 mt-1 rounded-md border border-muted/50 bg-muted/30 p-3">
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {details}
          </p>
        </div>
      )}
    </div>
  );
}
