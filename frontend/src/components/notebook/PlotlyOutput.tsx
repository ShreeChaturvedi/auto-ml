import { useMemo, useSyncExternalStore } from 'react';
import { LazyPlot, PlotSuspense } from '@/components/data/eda/edaTheme';
import { getChartHeightPref, subscribeChartHeightPref } from '@/lib/executionPrefs';

interface PlotlyOutputProps {
  data: unknown;
}

interface PlotlyFigure {
  data: Array<Record<string, unknown>>;
  layout?: Record<string, unknown>;
}

export function PlotlyOutput({ data }: PlotlyOutputProps) {
  const figure = data as PlotlyFigure | null;
  const chartHeight = useSyncExternalStore(subscribeChartHeightPref, getChartHeightPref);

  const layout = useMemo(
    () => ({ ...figure?.layout, autosize: true, height: chartHeight }),
    [figure?.layout, chartHeight]
  );

  if (!data || typeof data !== 'object') {
    return <pre className="text-sm text-muted-foreground">[Invalid chart data]</pre>;
  }

  return (
    <PlotSuspense height={chartHeight}>
      <LazyPlot
        data={figure!.data}
        layout={layout}
        config={{ responsive: true, displayModeBar: true }}
        className="w-full"
      />
    </PlotSuspense>
  );
}
