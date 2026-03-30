import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const pillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-default',
  {
    variants: {
      variant: {
        default:
          'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border',
        accent:
          'border-accent-border bg-accent-bg text-accent-text',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  icon?: React.ComponentType<{ className?: string }>;
  tooltip?: string;
}

const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ className, variant, icon: Icon, tooltip, children, ...props }, ref) => {
    const content = (
      <span
        ref={ref}
        className={cn(pillVariants({ variant }), className)}
        {...props}
      >
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
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
