/**
 * ColumnHealthCards — per-column health card and grid layout for the Quality tab.
 * Shows completeness, missing counts, type, uniqueness, and severity at a glance.
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { DataQualitySummary } from '@/types/file';
import { cn } from '@/lib/utils';
import { formatPercentage, truncateText } from './edaFormatters';
import { getSeverityLabel, DATA_TYPE_ICONS, DATA_TYPE_COLORS } from './edaConstants';

/* ------------------------------------------------------------------ */
/*  ColumnHealthCard                                                   */
/* ------------------------------------------------------------------ */

interface ColumnHealthCardProps {
  quality: DataQualitySummary;
  onClick?: () => void;
  className?: string;
}

export function ColumnHealthCard({ quality, onClick, className }: ColumnHealthCardProps) {
  const completeness = 100 - quality.missingPercentage;
  const severity = getSeverityLabel(completeness);
  const SeverityIcon = severity.icon;
  const TypeIcon = DATA_TYPE_ICONS[quality.dataType];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'bg-muted/40 border border-border/30 rounded-lg p-3 text-left w-full',
        'hover:border-border/60 transition-colors',
        className,
      )}
    >
      {/* Header: column name + type badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className="text-sm font-medium truncate"
          title={quality.column}
        >
          {truncateText(quality.column, 20)}
        </span>
        <Badge
          variant="secondary"
          className={cn('gap-1 text-[10px] shrink-0', DATA_TYPE_COLORS[quality.dataType])}
        >
          <TypeIcon className="h-2.5 w-2.5" />
          {quality.dataType}
        </Badge>
      </div>

      {/* Progress bar with severity-colored indicator */}
      <div style={{ '--severity-color': `hsl(var(${severity.colorVar}))` } as React.CSSProperties}>
        <Progress
          value={completeness}
          className="h-1.5 [&>div]:bg-[var(--severity-color)]"
        />
      </div>

      {/* Completeness + severity label */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-lg font-mono font-bold">
          {formatPercentage(completeness, true)}
        </span>
        <span className={cn('flex items-center gap-1 text-xs', severity.colorClass)}>
          <SeverityIcon className="h-3 w-3" />
          {severity.label}
        </span>
      </div>

      {/* Missing + unique counts */}
      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        <div>
          {quality.missingCount.toLocaleString()} missing ({formatPercentage(quality.missingPercentage)})
        </div>
        <div>
          {quality.uniqueCount.toLocaleString()} unique ({formatPercentage(quality.uniquePercentage)})
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  ColumnHealthGrid                                                   */
/* ------------------------------------------------------------------ */

interface ColumnHealthGridProps {
  dataQuality: DataQualitySummary[];
  onColumnClick?: (colName: string) => void;
  className?: string;
}

export function ColumnHealthGrid({ dataQuality, onColumnClick, className }: ColumnHealthGridProps) {
  const sorted = useMemo(
    () =>
      [...dataQuality].sort(
        (a, b) => b.missingPercentage - a.missingPercentage,
      ),
    [dataQuality],
  );

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2', className)}>
      {sorted.map((q) => (
        <ColumnHealthCard
          key={q.column}
          quality={q}
          onClick={onColumnClick ? () => onColumnClick(q.column) : undefined}
        />
      ))}
    </div>
  );
}
