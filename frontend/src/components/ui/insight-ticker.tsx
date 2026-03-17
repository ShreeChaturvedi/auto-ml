/**
 * InsightTicker — reusable cycling ticker that shows items one at a time
 * with a rise-up animation. Adapted from AnimatedPlaceholderInput.
 */

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  useInsightTicker,
  CHAR_ANIM_DURATION_MS,
  CHAR_STAGGER_MS,
} from './useInsightTicker';
import type { InsightAction } from '@/components/data/eda/edaInsights';
import { InsightActionIcons } from '@/components/data/eda/InsightActionIcons';

export interface InsightTickerItem {
  icon: LucideIcon;
  text: string;
  severity?: 'high' | 'medium' | 'low';
  actions?: InsightAction[];
}

interface InsightTickerProps {
  items: InsightTickerItem[];
  interval?: number;
  expandable?: boolean;
  className?: string;
  onAction?: (action: InsightAction) => void;
}

const severityColors: Record<string, string> = {
  high: 'text-amber-500',
  medium: 'text-yellow-500',
  low: 'text-muted-foreground',
};

function TickerRow({
  item,
  animateChars,
}: {
  item: InsightTickerItem;
  animateChars: boolean;
}) {
  const Icon = item.icon;
  const iconColor = severityColors[item.severity ?? 'low'];

  return (
    <span className="flex items-center gap-1.5 text-xs">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
      <span className="truncate">
        {animateChars
          ? Array.from(item.text).map((char, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  animation: `placeholder-char-in ${CHAR_ANIM_DURATION_MS}ms ease-out both`,
                  animationDelay: `${i * CHAR_STAGGER_MS}ms`,
                }}
              >
                {char === ' ' ? '\u00a0' : char}
              </span>
            ))
          : item.text}
      </span>
    </span>
  );
}

export function InsightTicker({
  items,
  interval = 3500,
  expandable = true,
  className,
  onAction,
}: InsightTickerProps) {
  const [open, setOpen] = useState(false);
  const {
    currentIndex,
    nextIndex,
    isAnimating,
    outgoingTransition,
    incomingTransition,
    prefersReducedMotion,
  } = useInsightTicker(items.length, interval);

  if (items.length === 0) return null;

  const currentItem = items[currentIndex];
  const nextItem = items[nextIndex];

  const ticker = (
    <div
      className={cn(
        'relative h-6 overflow-hidden flex items-center',
        expandable && 'cursor-pointer',
        className,
      )}
      onClick={expandable ? () => setOpen(true) : undefined}
    >
      <div className="relative h-5 flex-1 overflow-hidden">
        {/* Current item — slides up during animation */}
        <span
          className="absolute inset-x-0 top-0 flex items-center h-5"
          style={{
            transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
            opacity: isAnimating ? 0 : 1,
            transition: outgoingTransition,
          }}
        >
          <TickerRow item={currentItem} animateChars={false} />
        </span>

        {/* Next item — slides in from below */}
        <span
          className="absolute inset-x-0 top-0 flex items-center h-5"
          style={{
            transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
            opacity: isAnimating ? 1 : 0,
            transition: incomingTransition,
          }}
        >
          <TickerRow
            item={nextItem}
            animateChars={isAnimating && !prefersReducedMotion}
          />
        </span>
      </div>

      {/* Counter */}
      {items.length > 1 && (
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-2">
          {currentIndex + 1} of {items.length}
        </span>
      )}
    </div>
  );

  if (!expandable) return ticker;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{ticker}</PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <TooltipProvider delayDuration={200}>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {items.map((item, i) => {
              const Icon = item.icon;
              const iconColor = severityColors[item.severity ?? 'low'];
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50 group"
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', iconColor)} />
                  <span className="flex-1">{item.text}</span>
                  {item.actions && item.actions.length > 0 && onAction && (
                    <InsightActionIcons actions={item.actions} onAction={onAction} />
                  )}
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}
