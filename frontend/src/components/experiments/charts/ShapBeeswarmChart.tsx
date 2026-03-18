import { useMemo } from 'react';
import type { ShapResult } from '@/types/experiments';
import {
  LazyPlot,
  PlotSuspense,
  getPlotlyLayout,
  EDA_COLORSCALES,
  useIsDark,
  PLOTLY_CONFIG_INTERACTIVE,
} from '@/components/data/eda/edaTheme';

interface ShapBeeswarmChartProps {
  shapResult: ShapResult;
  topN?: number;
  height?: number;
}

/**
 * Interpolate a value t in [0,1] into the viridis colorscale.
 * Returns a hex color string.
 */
function interpolateViridis(t: number): string {
  const scale = EDA_COLORSCALES.viridis;
  const clamped = Math.max(0, Math.min(1, t));

  // Find the two surrounding stops
  for (let i = 0; i < scale.length - 1; i++) {
    const [t0, c0] = scale[i];
    const [t1, c1] = scale[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const ratio = (clamped - t0) / (t1 - t0);
      return lerpHex(c0, c1, ratio);
    }
  }
  return scale[scale.length - 1][1];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

function lerpHex(c0: string, c1: string, t: number): string {
  const [r0, g0, b0] = hexToRgb(c0);
  const [r1, g1, b1] = hexToRgb(c1);
  return rgbToHex(
    r0 + (r1 - r0) * t,
    g0 + (g1 - g0) * t,
    b0 + (b1 - b0) * t,
  );
}

export function ShapBeeswarmChart({
  shapResult,
  topN = 15,
  height = 500,
}: ShapBeeswarmChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    const { values, data, feature_names, mean_abs_values } = shapResult;
    const nSamples = values.length;
    if (nSamples === 0) return { plotData: [], layout: {} };

    // Sort features by mean abs SHAP value descending, take topN
    const featureIndices = mean_abs_values
      .map((v, i) => ({ idx: i, importance: v }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, topN)
      .map((d) => d.idx);

    // Reverse so most important is at top in the plot
    const orderedIndices = [...featureIndices].reverse();

    // Precompute min/max per feature for normalization
    const featureMinMax: Array<{ min: number; max: number }> = [];
    for (const fi of orderedIndices) {
      let min = Infinity;
      let max = -Infinity;
      for (let s = 0; s < nSamples; s++) {
        const v = data[s][fi];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      featureMinMax.push({ min, max });
    }

    // Pseudo-random deterministic jitter based on sample index
    const jitter = (sampleIdx: number) =>
      ((((sampleIdx * 2654435761) >>> 0) / 4294967296) - 0.5) * 0.35;

    // Create one trace per feature (for proper y-axis labels)
    const traces = orderedIndices.map((fi, yIdx) => {
      const featureName =
        feature_names[fi].length > 20
          ? feature_names[fi].slice(0, 17) + '...'
          : feature_names[fi];
      const fullName = feature_names[fi];
      const { min, max } = featureMinMax[yIdx];
      const range = max - min || 1;

      const xVals: number[] = [];
      const yVals: number[] = [];
      const colors: string[] = [];
      const hoverTexts: string[] = [];

      for (let s = 0; s < nSamples; s++) {
        const shapVal = values[s][fi];
        const featureVal = data[s][fi];
        const normalized = (featureVal - min) / range;

        xVals.push(shapVal);
        yVals.push(yIdx + jitter(s));
        colors.push(interpolateViridis(normalized));
        hoverTexts.push(
          `${fullName}<br>SHAP: ${shapVal.toFixed(4)}<br>Value: ${featureVal.toFixed(3)}`,
        );
      }

      return {
        type: 'scatter' as const,
        mode: 'markers' as const,
        x: xVals,
        y: yVals,
        marker: {
          color: colors,
          size: 3,
          opacity: 0.6,
        },
        name: featureName,
        showlegend: false,
        hovertemplate: hoverTexts.map((t) => `${t}<extra></extra>`),
      };
    });

    // Dummy colorbar trace for the viridis scale legend
    const colorbarTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: [null],
      y: [null],
      marker: {
        colorscale: EDA_COLORSCALES.viridis,
        cmin: 0,
        cmax: 1,
        color: [0],
        showscale: true,
        colorbar: {
          title: { text: 'Feature value', side: 'right' as const },
          thickness: 12,
          len: 0.5,
          tickvals: [0, 0.5, 1],
          ticktext: ['Low', 'Mid', 'High'],
          outlinecolor: isDark
            ? 'rgba(255,255,255,0.2)'
            : 'rgba(0,0,0,0.15)',
          tickfont: {
            color: isDark ? 'hsl(0,0%,64%)' : 'hsl(215.4,16.3%,46.9%)',
            size: 10,
          },
        },
      },
      showlegend: false,
      hoverinfo: 'skip' as const,
    };

    const featureLabels = orderedIndices.map((fi) =>
      feature_names[fi].length > 20
        ? feature_names[fi].slice(0, 17) + '...'
        : feature_names[fi],
    );

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      margin: { l: 140, r: 60, t: 8, b: 40 },
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: 'SHAP value', standoff: 8 },
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        tickvals: orderedIndices.map((_, i) => i),
        ticktext: featureLabels,
        range: [-0.5, orderedIndices.length - 0.5],
      },
    };

    return { plotData: [...traces, colorbarTrace], layout: mergedLayout };
  }, [shapResult, topN, height, isDark]);

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
