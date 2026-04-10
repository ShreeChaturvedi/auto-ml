/**
 * ErrorCard — two render branches:
 *
 * 1. `severity="warning"` → inline amber strip (NOT a card). Square
 *    edges (no `rounded-*`) explicitly distinguish it from the card
 *    flavour so the visual distinction between "real card" and
 *    "inline alert" is immediate.
 * 2. `severity="error"` → `ToolCardShell variant="error"` with an
 *    icon-only retry button in the header actions slot (top-right)
 *    and a collapsible traceback in the body.
 */

import { AlertTriangle, XCircle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { ToolCardShell } from '@/components/llm/shared/ToolCardShell';

export interface ErrorCardProps {
  message: string;
  severity: 'warning' | 'error';
  traceback?: string;
  onRetry?: () => void;
}

export function ErrorCard({ message, severity, traceback, onRetry }: ErrorCardProps) {
  if (severity === 'warning') {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 border-l-2 border-l-amber-400/70 bg-amber-500/5 px-3 py-1.5"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="flex-1 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          {message}
        </p>
      </div>
    );
  }

  const retryButton = onRetry ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            aria-label="Retry"
          >
            <RotateCw className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Retry</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  return (
    <ToolCardShell
      icon={XCircle}
      iconClassName="text-metric-negative"
      title={message}
      variant="error"
      actions={retryButton}
      expandable={!!traceback}
    >
      {traceback && (
        <pre className="max-h-[200px] overflow-auto bg-destructive/5 p-3 text-[11px] font-mono leading-relaxed text-metric-negative whitespace-pre-wrap">
          {traceback}
        </pre>
      )}
    </ToolCardShell>
  );
}
