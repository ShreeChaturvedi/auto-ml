import { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CorrelationData } from '@/types/file';
import { getCorrelationColor, getCorrelationLabel } from './edaFormatters';

interface CorrelationPairsListProps {
  correlations: CorrelationData[];
  maxPairs?: number;
  onPairClick?: (columnA: string, columnB: string) => void;
  className?: string;
}

export function CorrelationPairsList({
  correlations,
  maxPairs = 5,
  onPairClick,
  className,
}: CorrelationPairsListProps) {
  const topPairs = useMemo(
    () =>
      [...correlations]
        .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
        .slice(0, maxPairs),
    [correlations, maxPairs],
  );

  if (topPairs.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {topPairs.map((corr) => {
        const isPositive = corr.coefficient >= 0;
        const Arrow = isPositive ? ArrowUpRight : ArrowDownRight;

        return (
          <div
            key={`${corr.columnA}-${corr.columnB}`}
            role="button"
            tabIndex={0}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => onPairClick?.(corr.columnA, corr.columnB)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPairClick?.(corr.columnA, corr.columnB);
              }
            }}
          >
            <Arrow
              className={cn('h-3.5 w-3.5 shrink-0', getCorrelationColor(corr.coefficient))}
            />
            <span className="truncate flex-1">
              {corr.columnA} <span className="text-muted-foreground">&harr;</span> {corr.columnB}
            </span>
            <span
              className={cn(
                'font-mono font-medium shrink-0',
                getCorrelationColor(corr.coefficient),
              )}
            >
              {corr.coefficient.toFixed(2)}
            </span>
            <span className="text-muted-foreground shrink-0">
              {getCorrelationLabel(corr.coefficient)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
