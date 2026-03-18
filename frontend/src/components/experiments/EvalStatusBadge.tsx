import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type EvalStatus = 'pending' | 'computing' | 'ready' | 'failed' | undefined;

const EVAL_STATUS_CONFIG: Record<
  string,
  { label: string; className: string; pulse?: boolean }
> = {
  pending: {
    label: 'Evaluation Pending',
    className: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  },
  computing: {
    label: 'Evaluating...',
    className: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    pulse: true,
  },
  ready: {
    label: 'Evaluated',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  failed: {
    label: 'Evaluation Failed',
    className: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
  },
  none: {
    label: 'Not Evaluated',
    className: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  },
};

/**
 * Shared evaluation status badge used by both the Leaderboard table and
 * the ModelDetailPanel header. Accepts an optional status string and
 * renders the appropriate variant with pulse animation for "computing".
 *
 * Pass `compact` to use shorter labels and smaller text (e.g. inside
 * the leaderboard table rows).
 */
export function EvalStatusBadge({
  status,
  compact = false,
}: {
  status?: string;
  compact?: boolean;
}) {
  const key = status ?? 'none';
  const config = EVAL_STATUS_CONFIG[key] ?? EVAL_STATUS_CONFIG.none;

  const label = compact ? (key === 'none' ? '\u2014' : key.charAt(0).toUpperCase() + key.slice(1)) : config.label;

  return (
    <Badge
      variant="outline"
      className={cn(config.className, config.pulse && 'animate-pulse', compact && 'text-[10px]')}
    >
      {label}
    </Badge>
  );
}
