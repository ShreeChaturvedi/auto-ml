/**
 * ProposalActionButton — Accept/Reject button pair for `StepProposalCard`
 * (and the eventual rebuilt `ApprovalCard`).
 *
 * Design notes:
 *  - Border is always present (idle uses `border-transparent`) so selecting
 *    a state never shifts layout.
 *  - `accept / selected` uses the same tone as `StatusPill status="accepted"`
 *    — visual story stays consistent between button and pill.
 *  - `reject / selected` adds a strikethrough to the label so the
 *    "this step will be skipped" read is immediate.
 */

import * as React from 'react';
import { Check, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'accept' | 'reject';
type Size = 'sm' | 'md';

export interface ProposalActionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant: Variant;
  selected?: boolean;
  label?: string;
  icon?: LucideIcon;
  size?: Size;
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

function toneClass(variant: Variant, selected: boolean): string {
  if (variant === 'accept') {
    return selected
      ? 'border-metric-positive/30 bg-metric-positive/10 text-metric-positive'
      : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground';
  }
  return selected
    ? 'border-metric-negative/25 bg-metric-negative/5 text-metric-negative/90'
    : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground';
}

export const ProposalActionButton = React.forwardRef<
  HTMLButtonElement,
  ProposalActionButtonProps
>(
  (
    {
      variant,
      selected = false,
      label,
      icon,
      size = 'sm',
      className,
      type,
      ...rest
    },
    ref,
  ) => {
    const Icon = icon ?? (variant === 'accept' ? Check : X);
    const defaultLabel = variant === 'accept'
      ? (selected ? 'Selected' : 'Select')
      : 'Skip';
    const text = label ?? defaultLabel;
    const strike = variant === 'reject' && selected;

    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        aria-pressed={selected}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          SIZE_CLASS[size],
          toneClass(variant, selected),
          className,
        )}
        {...rest}
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span
          className={cn(
            strike && 'line-through decoration-metric-negative/40 decoration-[1.5px]',
          )}
        >
          {text}
        </span>
      </button>
    );
  },
);

ProposalActionButton.displayName = 'ProposalActionButton';
