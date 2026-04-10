/**
 * ToolCardShell — chrome for every rich lifecycle card.
 *
 * Guarantees:
 *  - neutral `rounded-md border bg-card shadow-sm dark:shadow-none` chrome
 *    (`variant="error"` swaps in `border-destructive/40 bg-destructive/5`).
 *  - header icon swaps to a chevron on hover/focus when `expandable={true}`.
 *  - smooth grid-row collapse animation — no jank inside the chat scroll.
 *  - header layout degrades gracefully at ~480px wide: title + subtitle
 *    truncate before the status pill and actions compress.
 *  - the header is a `role="button"` div (not a real `<button>`) so the
 *    `actions` slot can host real `<button>` elements without producing
 *    invalid nested-button HTML. Keyboard activation: Enter / Space.
 */

import * as React from 'react';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusPill, type StatusKind } from './StatusPill';

export interface ToolCardShellProps {
  icon: LucideIcon;
  iconClassName?: string;
  title: React.ReactNode;
  /** Muted inline subtitle — shares the flex-1 row with `title`. */
  subtitle?: React.ReactNode;
  status?: StatusKind;
  /** Override the default label on the generated StatusPill. */
  statusLabel?: string;
  /** Right-aligned controls (retry, copy, CTA). May contain real buttons. */
  actions?: React.ReactNode;
  variant?: 'default' | 'error';
  expandable?: boolean;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
  children?: React.ReactNode;
  className?: string;
  'data-step-id'?: string;
}

const HEADER_BASE_CLASSES = 'flex w-full items-center gap-2 px-3 py-2 text-left';
const HEADER_INTERACTIVE_CLASSES =
  'cursor-pointer hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function ToolCardShell({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  status,
  statusLabel,
  actions,
  variant = 'default',
  expandable = false,
  expanded: controlledExpanded,
  defaultExpanded = false,
  onExpandedChange,
  children,
  className,
  ...rest
}: ToolCardShellProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultExpanded);
  const expanded = controlledExpanded ?? uncontrolled;
  const bodyId = React.useId();

  const toggle = React.useCallback(() => {
    if (!expandable) return;
    const next = !expanded;
    if (controlledExpanded === undefined) setUncontrolled(next);
    onExpandedChange?.(next);
  }, [expandable, expanded, controlledExpanded, onExpandedChange]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!expandable) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [expandable, toggle],
  );

  const hasBody = !!children;
  const showAnimatedBody = expandable && hasBody;

  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        'group/card overflow-hidden rounded-md border shadow-sm dark:shadow-none',
        variant === 'error'
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-border bg-card',
        className,
      )}
      {...rest}
    >
      <div
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        onClick={expandable ? toggle : undefined}
        onKeyDown={expandable ? handleKeyDown : undefined}
        aria-expanded={expandable ? expanded : undefined}
        aria-controls={expandable && hasBody ? bodyId : undefined}
        className={cn(HEADER_BASE_CLASSES, expandable && HEADER_INTERACTIVE_CLASSES)}
      >
        {/* Icon / chevron swap slot */}
        <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
          <Icon
            className={cn(
              'h-4 w-4 transition-opacity',
              expandable && 'group-hover/card:opacity-0 group-focus-within/card:opacity-0',
              iconClassName,
            )}
          />
          {expandable && (
            <ChevronIcon
              className="absolute inset-0 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100"
              aria-hidden
            />
          )}
        </span>

        {/* Title + subtitle column (truncates first at narrow widths) */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {title}
          </span>
          {subtitle != null && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          )}
        </div>

        {/* Status pill — never compresses */}
        {status && (
          <StatusPill status={status} label={statusLabel} className="shrink-0" />
        )}

        {/* Actions — real buttons live here; stop propagation so clicking them
            does not also toggle the expand state of the header. */}
        {actions && (
          <div
            className="flex shrink-0 items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>

      {/* Animated collapsible body (grid-row trick for smooth height) */}
      {showAnimatedBody && (
        <div
          id={bodyId}
          className="grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
          aria-hidden={!expanded}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-t">{children}</div>
          </div>
        </div>
      )}

      {/* Non-expandable body (always visible) */}
      {!expandable && hasBody && <div className="border-t">{children}</div>}
    </div>
  );
}
