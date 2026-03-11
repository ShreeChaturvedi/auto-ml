import React, { Suspense, useMemo } from 'react';

const Plot = React.lazy(() => import('react-plotly.js'));

interface PlotlyOutputProps {
  data: unknown;
}

interface PlotlyFigure {
  data: Array<Record<string, unknown>>;
  layout?: Record<string, unknown>;
}

export function PlotlyOutput({ data }: PlotlyOutputProps) {
  const figure = data as PlotlyFigure | null;

  const layout = useMemo(
    () => ({ ...figure?.layout, autosize: true, height: 360 }),
    [figure?.layout]
  );

  if (!data || typeof data !== 'object') {
    return <pre className="text-sm text-muted-foreground">[Invalid chart data]</pre>;
  }

  return (
    <Suspense fallback={<div className="h-[300px] animate-pulse bg-muted/50 rounded-md" />}>
      <Plot
        data={figure!.data}
        layout={layout}
        config={{ responsive: true, displayModeBar: true }}
        className="w-full"
      />
    </Suspense>
  );
}
