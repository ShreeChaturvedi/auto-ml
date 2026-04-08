import { type ReactNode, useMemo } from 'react';
import { Play, Keyboard, Quote, CornerDownRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInsightTicker } from '@/components/ui/useInsightTicker';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface SqlChip {
  icon: LucideIcon;
  content: ReactNode;
}

interface SqlEditorChipsProps {
  visible: boolean;
  modKey: string;
}

import { Kbd } from '@/components/ui/contextual-tip-bar';

function ChipRow({ chip }: { chip: SqlChip }) {
  const Icon = chip.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0 opacity-60" />
      {chip.content}
    </span>
  );
}

export function SqlEditorChips({
  visible,
  modKey,
}: SqlEditorChipsProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const chips: SqlChip[] = useMemo(() => [
    {
      icon: CornerDownRight,
      content: (
        <span className="inline-flex items-center gap-1">
          <Kbd>Tab</Kbd>
          <span className="ml-0.5">to accept suggested query</span>
        </span>
      ),
    },
    {
      icon: Play,
      content: (
        <span className="inline-flex items-center gap-1">
          <Kbd>{modKey}</Kbd>
          <span className="text-muted-foreground/40">+</span>
          <Kbd>⏎</Kbd>
          <span className="ml-0.5">to run query</span>
        </span>
      ),
    },
    {
      icon: Keyboard,
      content: (
        <span className="inline-flex items-center gap-1">
          <Kbd>{modKey}</Kbd>
          <span className="text-muted-foreground/40">+</span>
          <Kbd>Space</Kbd>
          <span className="ml-0.5">for autocomplete</span>
        </span>
      ),
    },
    {
      icon: Quote,
      content: (
        <span>
          Wrap spaced column names in <Kbd>&quot;</Kbd> double quotes <Kbd>&quot;</Kbd>
        </span>
      ),
    },
  ], [modKey]);

  const {
    currentIndex,
    nextIndex,
    isAnimating,
    outgoingTransition,
    incomingTransition,
  } = useInsightTicker(chips.length, prefersReducedMotion ? 0 : 4000);

  const currentChip = chips[currentIndex];
  const nextChip = chips[nextIndex];

  return (
    <div
      className={cn(
        'absolute bottom-0 left-0 right-0 z-10',
        'border-t border-border/30 bg-muted/30 shrink-0',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}
    >
      <div className="flex items-center px-4 py-1.5">
        <div className="relative h-4 flex-1 overflow-hidden">
          {/* Current chip — slides up during animation */}
          <span
            className="absolute inset-x-0 top-0 flex items-center h-4"
            style={{
              transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
              opacity: isAnimating ? 0 : 1,
              transition: outgoingTransition,
            }}
          >
            <ChipRow chip={currentChip} />
          </span>

          {/* Next chip — slides in from below */}
          <span
            className="absolute inset-x-0 top-0 flex items-center h-4"
            style={{
              transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
              opacity: isAnimating ? 1 : 0,
              transition: incomingTransition,
            }}
          >
            <ChipRow chip={nextChip} />
          </span>
        </div>
      </div>
    </div>
  );
}
