/**
 * SparklineHistogram — tiny SVG bar chart for inline column previews.
 * Pure SVG — no Plotly overhead. Renders in microseconds vs Plotly's milliseconds.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineHistogramProps {
  buckets: Array<{ start: number; end: number; count: number }>;
  width?: number;
  height?: number;
  className?: string;
}

export function SparklineHistogram({
  buckets,
  width = 80,
  height = 36,
  className,
}: SparklineHistogramProps) {
  const bars = useMemo(() => {
    if (buckets.length === 0) return [];
    const maxCount = Math.max(...buckets.map((b) => b.count), 1);
    const barWidth = width / buckets.length;
    const gap = barWidth * 0.1;

    return buckets.map((b, i) => ({
      x: i * barWidth + gap / 2,
      y: height - (b.count / maxCount) * height,
      w: barWidth - gap,
      h: (b.count / maxCount) * height,
    }));
  }, [buckets, width, height]);

  if (bars.length === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      {bars.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          fill="hsl(var(--primary))"
          opacity={0.6}
          rx={1}
        />
      ))}
    </svg>
  );
}
