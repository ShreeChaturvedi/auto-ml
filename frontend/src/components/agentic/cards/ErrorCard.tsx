/**
 * ErrorCard - Displays errors and warnings with severity grading.
 *
 * Amber styling for warnings, red for errors. Includes an expandable
 * traceback section and an optional retry button.
 */

import { useState } from 'react';
import { AlertTriangle, XCircle, ChevronDown, ChevronRight, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ErrorCardProps {
  message: string;
  severity: 'warning' | 'error';
  traceback?: string;
  onRetry?: () => void;
}

const SEVERITY_CONFIG = {
  warning: {
    border: 'border-amber-300 dark:border-amber-700/50',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-900 dark:text-amber-200',
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
  },
  error: {
    border: 'border-destructive/40',
    bg: 'bg-destructive/5',
    text: 'text-destructive',
    icon: XCircle,
    iconClass: 'text-destructive',
  },
};

export function ErrorCard({ message, severity, traceback, onRetry }: ErrorCardProps) {
  const [traceExpanded, setTraceExpanded] = useState(false);
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-md border p-3 shadow-sm',
        config.border,
        config.bg,
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconClass)} />
        <p className={cn('flex-1 text-sm leading-relaxed', config.text)}>{message}</p>
      </div>

      {/* Expandable traceback */}
      {traceback && (
        <div className="mt-2 ml-6">
          <button
            type="button"
            onClick={() => setTraceExpanded(!traceExpanded)}
            className={cn(
              'flex items-center gap-1 text-xs transition-colors',
              config.text,
              'opacity-70 hover:opacity-100',
            )}
          >
            {traceExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Traceback
          </button>
          {traceExpanded && (
            <pre className="mt-1 max-h-[200px] overflow-auto rounded border border-muted/50 bg-muted/30 p-2 text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
              {traceback}
            </pre>
          )}
        </div>
      )}

      {/* Retry button */}
      {onRetry && (
        <div className="mt-3 ml-6">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onRetry}
          >
            <RotateCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
