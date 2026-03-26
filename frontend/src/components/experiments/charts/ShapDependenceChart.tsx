import { useMemo, useState } from 'react';
import type { ShapResult } from '@/types/experiments';
import {
  LazyPlot,
  PlotSuspense,
  getPlotlyLayout,
  EDA_COLORSCALES,
  useIsDark,
  PLOTLY_CONFIG_INTERACTIVE,
} from '@/components/data/eda/edaTheme';

interface ShapDependenceChartProps {
  shapResult: ShapResult;
  height?: number;
}

/**
 * Find the index of the feature whose raw values have the highest
 * absolute Pearson correlation with the selected feature's SHAP values.
 * Falls back to the second-most-important feature if correlation is degenerate.
 */
function findColorFeatureIndex(
  shapResult: ShapResult,
  selectedIdx: number,
): number {
  const { values, data, feature_names, mean_abs_values } = shapResult;
  const n = values.length;
  if (n < 3 || feature_names.length < 2) return selectedIdx;

  const shapVals = values.map((row) => row[selectedIdx]);
  let bestIdx = -1;
  let bestCorr = -1;

  for (let fi = 0; fi < feature_names.length; fi++) {
    if (fi === selectedIdx) continue;
    const featureVals = data.map((row) => row[fi]);
    const corr = Math.abs(pearson(shapVals, featureVals));
    if (Number.isFinite(corr) && corr > bestCorr) {
      bestCorr = corr;
      bestIdx = fi;
    }
  }

  // If correlation failed, use second-most-important feature
  if (bestIdx < 0) {
    const sorted = mean_abs_values
      .map((v, i) => ({ idx: i, v }))
      .sort((a, b) => b.v - a.v);
    bestIdx = sorted.find((d) => d.idx !== selectedIdx)?.idx ?? 0;
  }

  return bestIdx;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }
  const denom = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
  );
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export function ShapDependenceChart({
  shapResult,
  height = 400,
}: ShapDependenceChartProps) {
  const isDark = useIsDark();
  const { values, data, feature_names, mean_abs_values } = shapResult;

  // Sort features by importance for the dropdown
  const sortedFeatures = useMemo(() => {
    return mean_abs_values
      .map((v, i) => ({ idx: i, name: feature_names[i], importance: v }))
      .sort((a, b) => b.importance - a.importance);
  }, [mean_abs_values, feature_names]);

  // Default: most important feature
  const [selectedFeature, setSelectedFeature] = useState<string>(
    () => sortedFeatures[0]?.name ?? '',
  );

  const selectedIdx = feature_names.indexOf(selectedFeature);

  // Pre-compute best color feature for each feature (avoids recomputing correlation on every dropdown change)
  const colorFeatureLookup = useMemo(() => {
    const lookup: number[] = [];
    for (let i = 0; i < feature_names.length; i++) {
      lookup.push(findColorFeatureIndex(shapResult, i));
    }
    return lookup;
  }, [shapResult, feature_names.length]);

  const { plotData, layout } = useMemo(() => {
    if (selectedIdx < 0 || values.length === 0) {
      return { plotData: [], layout: {} };
    }

    const colorIdx = colorFeatureLookup[selectedIdx] ?? 0;
    const colorFeatureName = feature_names[colorIdx];

    const xVals = data.map((row) => row[selectedIdx]);
    const yVals = values.map((row) => row[selectedIdx]);
    const colorVals = data.map((row) => row[colorIdx]);

    const trace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: xVals,
      y: yVals,
      marker: {
        color: colorVals,
        colorscale: EDA_COLORSCALES.viridis,
        size: 4,
        opacity: 0.6,
        colorbar: {
          title: {
            text: colorFeatureName.length > 18
              ? colorFeatureName.slice(0, 15) + '...'
              : colorFeatureName,
            side: 'right' as const,
          },
          thickness: 12,
          outlinecolor: isDark
            ? 'rgba(255,255,255,0.2)'
            : 'rgba(0,0,0,0.15)',
          tickfont: {
            color: isDark ? 'hsl(0,0%,64%)' : 'hsl(215.4,16.3%,46.9%)',
            size: 10,
          },
        },
      },
      hovertemplate:
        `${selectedFeature}: %{x:.3f}<br>` +
        `SHAP: %{y:.4f}<br>` +
        `${colorFeatureName}: %{marker.color:.3f}<extra></extra>`,
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: selectedFeature, standoff: 8 },
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: `SHAP value for ${selectedFeature}`, standoff: 8 },
      },
    };

    return { plotData: [trace], layout: mergedLayout };
  }, [selectedIdx, colorFeatureLookup, values, data, feature_names, selectedFeature, isDark, height]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label
          htmlFor="shap-dep-feature"
          className="text-xs text-muted-foreground whitespace-nowrap"
        >
          Feature:
        </label>
        <select
          id="shap-dep-feature"
          value={selectedFeature}
          onChange={(e) => setSelectedFeature(e.target.value)}
          className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {sortedFeatures.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} ({f.importance.toFixed(4)})
            </option>
          ))}
        </select>
      </div>
      <PlotSuspense height={height}>
        <LazyPlot
          data={plotData}
          layout={layout}
          config={PLOTLY_CONFIG_INTERACTIVE}
          style={{ width: '100%', height }}
        />
      </PlotSuspense>
    </div>
  );
}
