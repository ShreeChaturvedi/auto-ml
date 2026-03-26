import { useMemo } from 'react';
import {
  LazyPlot,
  PlotSuspense,
  getPlotlyLayout,
  getEdaColors,
  useIsDark,
  PLOTLY_CONFIG_INTERACTIVE,
} from '@/components/data/eda/edaTheme';

interface ShapBarChartProps {
  featureNames: string[];
  importances: number[];
  topN?: number;
  height?: number;
  /** Label for x-axis — defaults to "Mean |SHAP value|" */
  xLabel?: string;
}

export function ShapBarChart({
  featureNames,
  importances,
  topN = 15,
  height = 400,
  xLabel = 'Mean |SHAP value|',
}: ShapBarChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    if (!featureNames.length || !importances.length) {
      return { plotData: [], layout: {} };
    }

    // Pair, sort descending by importance, and take topN
    const paired = featureNames.map((name, i) => ({
      name,
      importance: importances[i] ?? 0,
    }));
    paired.sort((a, b) => b.importance - a.importance);
    const top = paired.slice(0, topN);

    // Reverse so highest appears at top in horizontal bar chart
    const reversedNames = top.map((d) =>
      d.name.length > 20 ? d.name.slice(0, 17) + '...' : d.name,
    ).reverse();
    const reversedImportances = top.map((d) => d.importance).reverse();
    const fullNames = top.map((d) => d.name).reverse();

    const colors = getEdaColors(isDark);

    const trace = {
      type: 'bar' as const,
      orientation: 'h' as const,
      x: reversedImportances,
      y: reversedNames,
      marker: { color: colors[0] },
      hovertemplate: fullNames.map(
        (name, i) =>
          `${name}: ${reversedImportances[i].toFixed(4)}<extra></extra>`,
      ),
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      margin: { l: 140, r: 16, t: 8, b: 40 },
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: xLabel, standoff: 8 },
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        automargin: true,
      },
    };

    return { plotData: [trace], layout: mergedLayout };
  }, [featureNames, importances, topN, height, xLabel, isDark]);

  return (
    <PlotSuspense height={height}>
      <LazyPlot
        data={plotData}
        layout={layout}
        config={PLOTLY_CONFIG_INTERACTIVE}
        style={{ width: '100%', height }}
      />
    </PlotSuspense>
  );
}
