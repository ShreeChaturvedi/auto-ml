import { useMemo } from 'react';
import type { ModelRecord } from '@/types/model';
import {
  LazyPlot,
  PlotSuspense,
  getPlotlyLayout,
  EDA_COLORSCALES,
  useIsDark,
  PLOTLY_CONFIG_INTERACTIVE,
} from '@/components/data/eda/edaTheme';
import { PRIMARY_METRIC } from './utils';

export function ModelsParallelCoords({ models }: { models: ModelRecord[] }) {
  const isDark = useIsDark();

  const { trace, layout, canRender } = useMemo(() => {
    if (models.length < 2) return { trace: null, layout: null, canRender: false };

    const algorithms = new Set(models.map((m) => m.algorithm));
    const sameAlgorithm = algorithms.size === 1;

    const metricKeys = Array.from(new Set(models.flatMap((m) => Object.keys(m.metrics))));

    const paramKeys = sameAlgorithm
      ? Array.from(
          new Set(
            models.flatMap((m) =>
              Object.entries(m.parameters)
                .filter(([, v]) => typeof v === 'number')
                .map(([k]) => k),
            ),
          ),
        )
      : [];

    const allKeys = [...paramKeys, ...metricKeys];
    if (allKeys.length < 2) return { trace: null, layout: null, canRender: false };

    const dimensions = allKeys.map((key) => {
      const values = models.map((m) => {
        if (key in m.metrics) return m.metrics[key];
        const pVal = m.parameters[key];
        return typeof pVal === 'number' ? pVal : null;
      });
      const numericValues = values.filter((v): v is number => v != null && Number.isFinite(v));
      const min = numericValues.length > 0 ? Math.min(...numericValues) : 0;
      const max = numericValues.length > 0 ? Math.max(...numericValues) : 1;
      return {
        label: key,
        values: values.map((v) => (v != null && Number.isFinite(v) ? v : null)),
        range: [min === max ? min - 0.01 : min, min === max ? max + 0.01 : max],
      };
    });

    const taskTypes = Array.from(new Set(models.map((m) => m.taskType)));
    const primaryKey = PRIMARY_METRIC[taskTypes[0]] ?? metricKeys[0];
    const colorValues = models.map((m) => m.metrics[primaryKey] ?? 0);

    const parcoordsTrace = {
      type: 'parcoords' as const,
      dimensions,
      line: {
        color: colorValues,
        colorscale: EDA_COLORSCALES.viridis,
        showscale: true,
        colorbar: { title: { text: primaryKey, side: 'right' as const }, thickness: 12, len: 0.8 },
      },
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = { ...baseLayout, height: 320, margin: { l: 60, r: 80, t: 24, b: 24 } };

    return { trace: parcoordsTrace, layout: mergedLayout, canRender: true };
  }, [models, isDark]);

  if (!canRender || !trace || !layout) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Need at least 2 models to render parallel coordinates.
      </div>
    );
  }

  return (
    <PlotSuspense height={320} loadingLabel="Rendering parallel coordinates...">
      <LazyPlot data={[trace]} layout={layout} config={PLOTLY_CONFIG_INTERACTIVE} className="w-full" />
    </PlotSuspense>
  );
}
