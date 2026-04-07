import { type ReactNode, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInsightTicker } from '@/components/ui/useInsightTicker';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

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

interface ContextualTipBarProps {
  tips: ContextualTip[];
  interval?: number;
  className?: string;
}

function TipRow({ tip }: { tip: ContextualTip }) {
  const Icon = tip.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0 opacity-60" />
      {tip.content}
    </span>
  );
}

export function ContextualTipBar({ tips, interval = 4000, className }: ContextualTipBarProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const textLengths = useMemo(
    () => tips.map((t) => (typeof t.content === 'string' ? t.content.length : 40)),
    [tips],
  );

  const {
    currentIndex,
    nextIndex,
    isAnimating,
    outgoingTransition,
    incomingTransition,
  } = useInsightTicker(tips.length, prefersReducedMotion ? 0 : interval, textLengths);

  if (tips.length === 0) return null;

  const currentTip = tips[currentIndex];
  const nextTip = tips[nextIndex];

  return (
    <div className={cn('border-t border-border/30 bg-muted/30 shrink-0', className)}>
      <div className="flex items-center px-4 py-1.5">
        <div className="relative h-4 flex-1 overflow-hidden">
          <span
            className="absolute inset-x-0 top-0 flex items-center h-4"
            style={{
              transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
              opacity: isAnimating ? 0 : 1,
              transition: outgoingTransition,
            }}
          >
            <TipRow tip={currentTip} />
          </span>
          <span
            className="absolute inset-x-0 top-0 flex items-center h-4"
            style={{
              transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
              opacity: isAnimating ? 1 : 0,
              transition: incomingTransition,
            }}
          >
            <TipRow tip={nextTip} />
          </span>
        </div>
      </div>
    </div>
  );
}
