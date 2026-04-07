import { useMemo } from 'react';
import { LazyPlot, getPlotlyLayout, useIsDark } from '@/components/data/eda/edaTheme';
import { PlotSuspense } from '@/components/data/eda/PlotSuspense';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';
import type { PredictionResult } from '@/types/deployment';

interface PredictionResultViewProps {
  result: PredictionResult | null;
  taskType: 'classification' | 'regression';
  isLoading?: boolean;
  pinned?: PredictionResult | null;
}

/* ------------------------------------------------------------------ */
/*  SHAP waterfall sub-component                                        */
/* ------------------------------------------------------------------ */

function ShapWaterfall({
  shapValues,
  isDark,
}: {
  shapValues: { feature: string; value: number }[];
  isDark: boolean;
}) {
  const { plotData, layout } = useMemo(() => {
    const sorted = [...shapValues]
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 10);

    const base = getPlotlyLayout(isDark);
    const trace = {
      type: 'waterfall' as const,
      orientation: 'h' as const,
      y: sorted.map((s) => (s.feature.length > 22 ? s.feature.slice(0, 19) + '…' : s.feature)),
      x: sorted.map((s) => s.value),
      connector: { visible: false },
      decreasing: { marker: { color: 'hsl(0, 68%, 58%)' } },
      increasing: { marker: { color: 'hsl(210, 68%, 58%)' } },
      totals: { marker: { color: 'hsl(215, 20%, 55%)' } },
      hovertemplate: sorted.map(
        (s) => `${s.feature}: ${s.value > 0 ? '+' : ''}${s.value.toFixed(4)}<extra></extra>`,
      ),
    };
    const merged = {
      ...base,
      height: 300,
      margin: { l: 130, r: 20, t: 30, b: 30 },
      title: { text: 'Feature Contributions', font: { size: 12 } },
      yaxis: { ...(base.yaxis as object), automargin: true },
    };
    return { plotData: [trace], layout: merged };
  }, [shapValues, isDark]);

  return (
    <PlotSuspense height={300} loadingLabel="Loading SHAP…">
      <LazyPlot
        data={plotData}
        layout={layout}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
      />
    </PlotSuspense>
  );
}

/* ------------------------------------------------------------------ */
/*  Probability bar chart (classification)                             */
/* ------------------------------------------------------------------ */

function ProbabilityBars({
  probabilities,
  topClass,
  themeColor,
  isDark,
}: {
  probabilities: Record<string, number>;
  topClass: string;
  themeColor: string | undefined;
  isDark: boolean;
}) {
  const { plotData, layout } = useMemo(() => {
    const entries = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(([cls]) => cls);
    const values = entries.map(([, p]) => p);
    const accent = themeColor ?? (isDark ? 'hsl(210, 65%, 70%)' : 'hsl(210, 60%, 55%)');
    const muted = isDark ? 'hsl(215, 15%, 45%)' : 'hsl(215, 15%, 65%)';
    const colors = labels.map((l) => (l === topClass ? accent : muted));

    const base = getPlotlyLayout(isDark);
    const trace = {
      type: 'bar' as const,
      orientation: 'h' as const,
      x: values,
      y: labels,
      marker: { color: colors },
      hovertemplate: labels.map(
        (l, i) => `${l}: ${(values[i] * 100).toFixed(1)}%<extra></extra>`,
      ),
    };
    const merged = {
      ...base,
      height: Math.max(120, entries.length * 32 + 40),
      margin: { l: 100, r: 16, t: 8, b: 32 },
      xaxis: {
        ...(base.xaxis as object),
        range: [0, 1],
        tickformat: '.0%',
      },
      yaxis: { ...(base.yaxis as object), automargin: true },
    };
    return { plotData: [trace], layout: merged };
  }, [probabilities, topClass, themeColor, isDark]);

  const chartHeight = Math.max(120, Object.keys(probabilities).length * 32 + 40);
  return (
    <PlotSuspense height={chartHeight}>
      <LazyPlot
        data={plotData}
        layout={layout}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
      />
    </PlotSuspense>
  );
}

/* ------------------------------------------------------------------ */
/*  Comparison row helper                                               */
/* ------------------------------------------------------------------ */

function DeltaBadge({ current, pinned }: { current: number; pinned: number }) {
  const delta = current - pinned;
  if (Math.abs(delta) < 1e-6) return null;
  const positive = delta > 0;
  return (
    <span
      className={cn(
        'text-xs font-mono ml-1.5 px-1 py-0.5 rounded',
        positive
          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
          : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40',
      )}
    >
      {positive ? '+' : ''}
      {delta > 0 ? delta.toFixed(4) : delta.toFixed(4)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function PredictionResultView({
  result,
  taskType,
  isLoading,
  pinned,
}: PredictionResultViewProps) {
  const isDark = useIsDark();
  const { themeColor, themeColorClass } = useProjectThemeColor();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Running prediction…
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Make a prediction to see results
      </div>
    );
  }

  const isClassification = taskType === 'classification';

  /* Derive the top class for classification */
  const topClass =
    isClassification && result.probabilities
      ? Object.entries(result.probabilities).sort((a, b) => b[1] - a[1])[0]?.[0] ?? String(result.prediction)
      : null;

  return (
    <div className="space-y-4">
      {/* ---- Primary result headline ---- */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">
            {isClassification ? 'Predicted class' : 'Predicted value'}
          </p>
          <p
            className={cn(
              'text-2xl font-semibold font-mono truncate',
              isClassification && themeColorClass,
            )}
          >
            {String(result.prediction)}
          </p>

          {/* Regression: prediction interval */}
          {!isClassification && result.predictionInterval && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              95% interval: [{result.predictionInterval.lower.toFixed(4)},{' '}
              {result.predictionInterval.upper.toFixed(4)}]
            </p>
          )}

          {/* Classification: top probability */}
          {isClassification && result.probabilities && topClass && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              confidence{' '}
              {((result.probabilities[topClass] ?? 0) * 100).toFixed(1)}%
            </p>
          )}
        </div>

        {/* Pinned comparison badge */}
        {pinned && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted-foreground mb-0.5">Pinned</p>
            <p className="text-sm font-mono text-muted-foreground line-through">
              {String(pinned.prediction)}
            </p>
            {!isClassification &&
              typeof result.prediction === 'number' &&
              typeof pinned.prediction === 'number' && (
                <DeltaBadge current={result.prediction} pinned={pinned.prediction} />
              )}
          </div>
        )}
      </div>

      {/* ---- Classification probability bars ---- */}
      {isClassification && result.probabilities && topClass && (
        <ProbabilityBars
          probabilities={result.probabilities}
          topClass={topClass}
          themeColor={themeColor}
          isDark={isDark}
        />
      )}

      {/* ---- Pinned probability comparison ---- */}
      {isClassification &&
        pinned?.probabilities &&
        result.probabilities && (
          <div className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              vs pinned
            </p>
            {Object.entries(result.probabilities)
              .sort((a, b) => b[1] - a[1])
              .map(([cls, prob]) => {
                const pinnedProb = pinned.probabilities?.[cls] ?? 0;
                const delta = prob - pinnedProb;
                return (
                  <div key={cls} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground truncate max-w-[120px]">{cls}</span>
                    <span>
                      {(prob * 100).toFixed(1)}%
                      {Math.abs(delta) >= 0.001 && (
                        <span
                          className={cn(
                            'ml-1.5',
                            delta > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {delta > 0 ? '+' : ''}
                          {(delta * 100).toFixed(1)}pp
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        )}

      {/* ---- SHAP waterfall ---- */}
      {result.shapValues && result.shapValues.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Explanation</p>
          <ShapWaterfall shapValues={result.shapValues} isDark={isDark} />
        </div>
      )}
    </div>
  );
}
