import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Pill primitive shared by metric pills (ModelDetailPanel) and the
 * LLM tool-result StatusPill wrapper under `components/llm/shared/`.
 *
 * `shape="rounded"` + `size="sm"` + `tone="neutral"` (all defaults) is
 * the ModelDetailPanel chrome. `shape="pill"` + `size="xs"` + a semantic
 * `tone` is the capsule status badge used throughout the rebuilt
 * lifecycle cards.
 */
const pillVariants = cva(
  'inline-flex items-center border transition-colors cursor-default',
  {
    variants: {
      shape: {
        rounded: 'rounded-md',
        pill: 'rounded-full tabular-nums',
      },
      size: {
        sm: 'px-2 py-0.5 text-[11px] font-medium gap-1.5',
        xs: 'px-2 py-0.5 text-[10px] gap-1',
      },
      tone: {
        neutral:
          'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border',
        success:
          'border-metric-positive/30 bg-metric-positive/10 text-metric-positive',
        failed:
          'border-metric-negative/30 bg-metric-negative/10 text-metric-negative',
        running:
          'border-accent-border/60 bg-accent-bg/60 text-accent-text',
        pending:
          'border-border/70 bg-muted/30 text-muted-foreground',
        selected:
          'border-primary/25 bg-primary/10 text-primary',
        skipped:
          'border-metric-negative/25 bg-metric-negative/5 text-metric-negative/80',
        warning:
          'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        info:
          'border-border/70 bg-muted/30 text-muted-foreground',
      },
    },
    defaultVariants: {
      shape: 'rounded',
      size: 'sm',
      tone: 'neutral',
    },
  },
);

export interface PillProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>,
    VariantProps<typeof pillVariants> {
  icon?: React.ComponentType<{ className?: string }> | null;
  iconClassName?: string;
  tooltip?: React.ReactNode;
}

const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  (
    { className, shape, size, tone, icon: Icon, iconClassName, tooltip, children, ...props },
    ref,
  ) => {
    const content = (
      <span
        ref={ref}
        className={cn(pillVariants({ shape, size, tone }), className)}
        {...props}
      >
        {Icon ? <Icon className={cn('h-3 w-3 shrink-0', iconClassName)} /> : null}
        {children}
      </span>
    );

    if (!tooltip) return content;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  },
);

Pill.displayName = 'Pill';

export { Pill };
