import { type CSSProperties, type ReactNode, useMemo, useSyncExternalStore } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInsightTicker } from '@/components/ui/useInsightTicker';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getShowTipsPref, subscribeShowTipsPref } from '@/lib/generalPrefs';

export interface ContextualTip {
  id: string;
  icon: LucideIcon;
  content: ReactNode;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded border border-border/60 bg-background/80 text-[10px] font-mono font-medium text-muted-foreground leading-none">
      {children}
    </kbd>
  );
}

function TipRow({ tip, className, style }: { tip: ContextualTip; className?: string; style?: CSSProperties }) {
  const Icon = tip.icon;
  return (
    <span
      className={cn('absolute inset-x-0 top-0 flex h-full items-center gap-1.5 text-xs text-muted-foreground', className)}
      style={style}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-60" />
      {tip.content}
    </span>
  );
}

interface TipTickerProps {
  tips: ContextualTip[];
  interval?: number;
  className?: string;
  rowClassName?: string;
}

export function TipTicker({ tips, interval = 4000, className, rowClassName }: TipTickerProps) {
  const showTips = useSyncExternalStore(subscribeShowTipsPref, getShowTipsPref);
  const prefersReducedMotion = usePrefersReducedMotion();
  const safeTips = useMemo(
    () => tips.filter((tip): tip is ContextualTip => Boolean(tip?.icon) && tip?.content != null),
    [tips],
  );

  const textLengths = useMemo(
    () => safeTips.map((t) => (typeof t.content === 'string' ? t.content.length : 40)),
    [safeTips],
  );

  const {
    currentIndex,
    nextIndex,
    isAnimating,
    outgoingTransition,
    incomingTransition,
  } = useInsightTicker(safeTips.length, prefersReducedMotion ? 0 : interval, textLengths);

  if (!showTips || safeTips.length === 0) return null;

  const currentTip = safeTips[currentIndex] ?? safeTips[0];
  const nextTip = safeTips[nextIndex] ?? currentTip;

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <TipRow
        tip={currentTip}
        className={rowClassName}
        style={{
          transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
          opacity: isAnimating ? 0 : 1,
          transition: outgoingTransition,
        }}
      />
      <TipRow
        tip={nextTip}
        className={rowClassName}
        style={{
          transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
          opacity: isAnimating ? 1 : 0,
          transition: incomingTransition,
        }}
      />
    </div>
  );
}

interface ContextualTipBarProps {
  tips: ContextualTip[];
  interval?: number;
  className?: string;
}

export function ContextualTipBar({ tips, interval, className }: ContextualTipBarProps) {
  return (
    <div className={cn('border-t border-border/30 bg-muted/30 shrink-0', className)}>
      <div className="flex items-center px-4 py-1.5">
        <TipTicker tips={tips} interval={interval} className="h-4 flex-1" />
      </div>
    </div>
  );
}
