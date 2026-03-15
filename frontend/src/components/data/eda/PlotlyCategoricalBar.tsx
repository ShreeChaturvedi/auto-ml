/**
 * PlotlyCategoricalBar — Horizontal bar chart for top categorical values
 * with percentage annotations.
 */

import { useMemo } from 'react';
import {
  LazyPlot,
  PlotSuspense,
  PLOTLY_CONFIG,
  getPlotlyLayout,
  getEdaColors,
  useIsDark,
} from './edaTheme';
import { formatPercentage, truncateText } from './edaFormatters';
import type { CategoricalColumnSummary } from '@/types/file';

interface PlotlyCategoricalBarProps {
  data: CategoricalColumnSummary;
  height?: number;
  maxBars?: number;
  className?: string;
}

export function PlotlyCategoricalBar({
  data,
  height = 250,
  maxBars = 10,
  className,
}: PlotlyCategoricalBarProps) {
  const isDark = useIsDark();

  const { traces, layout } = useMemo(() => {
    // Sort by count descending, limit to maxBars
    const sorted = [...data.topValues]
      .sort((a, b) => b.count - a.count)
      .slice(0, maxBars);

    // Reverse so that highest count appears at the top of the horizontal chart
    // (Plotly renders y-axis bottom-to-top by default)
    const ordered = sorted.reverse();

    const yLabels = ordered.map((v) => truncateText(v.value, 20));
    const xValues = ordered.map((v) => v.count);
    const textLabels = ordered.map((v) => formatPercentage(v.percentage, true));

    const edaColors = getEdaColors(isDark);

    const barTrace: Record<string, unknown> = {
      type: 'bar',
      orientation: 'h',
      x: xValues,
      y: yLabels,
      text: textLabels,
      textposition: 'auto',
      marker: {
        color: edaColors[0],
      },
      hovertemplate: ordered.map(
        (v) =>
          `${v.value}: ${v.count.toLocaleString()} (${formatPercentage(v.percentage)})<extra></extra>`,
      ),
    };

    const overrides: Record<string, unknown> = {
      height,
      showlegend: false,
      xaxis: { title: 'Count' },
      yaxis: { automargin: true },
      margin: { l: 120, r: 16, t: 24, b: 40 },
    };

    const layout = { ...getPlotlyLayout(isDark), ...overrides };
    return { traces: [barTrace], layout };
  }, [data, maxBars, height, isDark]);

  if (data.topValues.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No category data available
      </div>
    );
  }

  return (
    <div className={className}>
      <PlotSuspense height={height}>
        <LazyPlot
          data={traces}
          layout={layout}
          config={PLOTLY_CONFIG}
          className="w-full"
        />
      </PlotSuspense>
    </div>
  );
}
