import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle, RotateCcw, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { LazyPlot, getPlotlyLayout, useIsDark, PLOTLY_CONFIG } from '@/components/data/eda/edaTheme';
import { PlotSuspense } from '@/components/data/eda/PlotSuspense';
import { Sparkline } from '@/components/experiments/charts/Sparkline';
import type { DeploymentRecord, DeploymentStatsHourly } from '@/types/deployment';
import { getDeploymentStats, runDriftDetection } from '@/lib/api/deployments';
import type { DriftReport } from '@/types/deployment';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Time range options                                                 */
/* ------------------------------------------------------------------ */

const TIME_RANGES = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
] as const;

type TimeRange = (typeof TIME_RANGES)[number]['value'];

const RANGE_LABEL: Record<TimeRange, string> = { '1h': '1h window', '6h': '6h window', '24h': '24h window', '7d': '7d window' };

/* ------------------------------------------------------------------ */
/*  KPI computation                                                    */
/* ------------------------------------------------------------------ */

function computeKpis(stats: DeploymentStatsHourly[]) {
  const totalRequests = stats.reduce((sum, s) => sum + s.requestCount, 0);
  const totalErrors = stats.reduce((sum, s) => sum + s.errorCount, 0);
  const withLatency = stats.filter(s => s.latencyAvg != null);
  const avgLatency = withLatency.length > 0
    ? Math.round(withLatency.reduce((sum, s) => sum + (s.latencyAvg ?? 0), 0) / withLatency.length)
    : 0;
  const p95Values = stats.filter(s => s.latencyP95 != null);
  const p95 = p95Values.length > 0
    ? Math.round(p95Values.reduce((sum, s) => sum + (s.latencyP95 ?? 0), 0) / p95Values.length)
    : 0;
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests * 100) : 0;
  return { totalRequests, avgLatency, errorRate, totalErrors, p95 };
}

/* ------------------------------------------------------------------ */
/*  Trend delta computation                                            */
/* ------------------------------------------------------------------ */

interface TrendDelta { pct: number; direction: 'up' | 'down' | 'neutral'; }

function computeTrend(current: number, previous: number): TrendDelta {
  if (previous === 0 && current === 0) return { pct: 0, direction: 'neutral' };
  if (previous === 0) return { pct: 100, direction: 'up' };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return { pct: 0, direction: 'neutral' };
  return { pct: Math.abs(Math.round(pct)), direction: pct > 0 ? 'up' : 'down' };
}

function computeTrends(stats: DeploymentStatsHourly[]) {
  if (stats.length < 2) return null;
  const mid = Math.floor(stats.length / 2);
  const prev = computeKpis(stats.slice(0, mid));
  const curr = computeKpis(stats.slice(mid));
  return {
    requests: computeTrend(curr.totalRequests, prev.totalRequests),
    latency:  computeTrend(curr.avgLatency, prev.avgLatency),
    errorRate: computeTrend(curr.errorRate, prev.errorRate),
    uptime: { pct: 0, direction: 'neutral' as const }, // uptime is relative, keep neutral
  };
}

/* ------------------------------------------------------------------ */
/*  Trend badge                                                        */
/* ------------------------------------------------------------------ */

function TrendBadge({ delta, goodDirection }: { delta: TrendDelta; goodDirection: 'up' | 'down' }) {
  if (delta.direction === 'neutral') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <ArrowRight className="h-3 w-3" /> 0%
      </span>
    );
  }
  const isGood = delta.direction === goodDirection;
  const color = isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  const Icon = delta.direction === 'up' ? ArrowUp : ArrowDown;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs', color)}>
      <Icon className="h-3 w-3" /> {delta.pct}%
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Drift status helpers                                               */
/* ------------------------------------------------------------------ */

const DRIFT_STATUS = {
  green:  { dot: 'bg-emerald-500', label: 'No Drift',  text: 'text-emerald-600 dark:text-emerald-400' },
  yellow: { dot: 'bg-amber-500',   label: 'Warning',   text: 'text-amber-600 dark:text-amber-400' },
  red:    { dot: 'bg-red-500',     label: 'Drift',     text: 'text-red-600 dark:text-red-400' },
} as const;

/* ------------------------------------------------------------------ */
/*  MetricGrid — InsightGrid-style 2×2 KPI container                   */
/* ------------------------------------------------------------------ */

interface MetricCell {
  label: string;
  value: string;
  secondary: string;
  sparkline: number[];
  sparkColor?: string;
  trend: TrendDelta | null;
  goodDirection: 'up' | 'down';
}

function MetricGrid({ cells }: { cells: MetricCell[] }) {
  return (
    <div className="rounded-xl border border-border shadow-sm dark:shadow-none overflow-hidden grid grid-cols-2">
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={cn(
            'p-3.5 card-enter border-b border-r border-border',
            '[&:nth-child(even)]:border-r-0',
            '[&:nth-last-child(-n+2)]:border-b-0',
          )}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">{cell.label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums">{cell.value}</span>
            {cell.trend && <TrendBadge delta={cell.trend} goodDirection={cell.goodDirection} />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground/60 truncate">{cell.secondary}</p>
          <div className="mt-2">
            <Sparkline values={cell.sparkline} color={cell.sparkColor} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-border overflow-hidden grid grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'p-3.5 space-y-2 border-b border-r border-border',
            '[&:nth-child(even)]:border-r-0',
            '[&:nth-last-child(-n+2)]:border-b-0',
          )}
        >
          <div className="h-2.5 w-20 rounded skeleton-shimmer" />
          <div className="h-6 w-16 rounded skeleton-shimmer" />
          <div className="h-2.5 w-24 rounded skeleton-shimmer" />
          <div className="h-8 w-full rounded skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  deployment: DeploymentRecord;
}

export function MonitoringTab({ deployment }: Props) {
  const isDark = useIsDark();
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [stats, setStats] = useState<DeploymentStatsHourly[]>([]);
  const [loading, setLoading] = useState(true);

  const [drift, setDrift] = useState<DriftReport | null>(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  /* ---- fetch stats ---- */
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setStatsError(null);
    try {
      const res = await getDeploymentStats(deployment.deploymentId, timeRange);
      setStats(res.stats);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [deployment.deploymentId, timeRange]);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  /* ---- KPIs ---- */
  const kpis = useMemo(() => computeKpis(stats), [stats]);

  /* ---- uptime ---- */
  const uptime = useMemo(() => {
    if (stats.length === 0) return 100;
    const healthy = stats.filter(s => s.errorCount < s.requestCount || s.requestCount === 0).length;
    return Math.round((healthy / stats.length) * 100 * 10) / 10;
  }, [stats]);

  /* ---- trends ---- */
  const trends = useMemo(() => computeTrends(stats), [stats]);

  /* ---- sparkline data ---- */
  const requestSparkline = useMemo(() => stats.map(s => s.requestCount), [stats]);
  const latencySparkline = useMemo(() => stats.map(s => s.latencyAvg ?? 0), [stats]);
  const errorSparkline = useMemo(() => {
    return stats.map(s => s.requestCount > 0 ? (s.errorCount / s.requestCount * 100) : 0);
  }, [stats]);
  const uptimeSparkline = useMemo(() => {
    return stats.map(s => s.requestCount === 0 ? 100 : ((s.requestCount - s.errorCount) / s.requestCount) * 100);
  }, [stats]);

  /* ---- metric cells ---- */
  const hoursInRange = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[timeRange];
  const metricCells: MetricCell[] = useMemo(() => [
    {
      label: 'Total Requests',
      value: kpis.totalRequests.toLocaleString(),
      secondary: `Avg ${Math.round(kpis.totalRequests / hoursInRange)}/hr`,
      sparkline: requestSparkline,
      trend: trends?.requests ?? null,
      goodDirection: 'up' as const,
    },
    {
      label: 'Avg Latency',
      value: `${kpis.avgLatency}ms`,
      secondary: `p95: ${kpis.p95}ms`,
      sparkline: latencySparkline,
      sparkColor: 'text-amber-500/60',
      trend: trends?.latency ?? null,
      goodDirection: 'down' as const,
    },
    {
      label: 'Error Rate',
      value: `${kpis.errorRate.toFixed(1)}%`,
      secondary: `${kpis.totalErrors} errors total`,
      sparkline: errorSparkline,
      sparkColor: 'text-red-500/60',
      trend: trends?.errorRate ?? null,
      goodDirection: 'down' as const,
    },
    {
      label: 'Uptime',
      value: `${uptime}%`,
      secondary: RANGE_LABEL[timeRange],
      sparkline: uptimeSparkline,
      sparkColor: 'text-emerald-500/60',
      trend: trends?.uptime ?? null,
      goodDirection: 'up' as const,
    },
  ], [kpis, uptime, requestSparkline, latencySparkline, errorSparkline, uptimeSparkline, trends, timeRange, hoursInRange]);

  /* ---- chart data ---- */
  const volumeData = useMemo(() => [{
    type: 'scatter' as const,
    x: stats.map(s => s.hourBucket),
    y: stats.map(s => s.requestCount),
    fill: 'tozeroy' as const,
    line: { color: 'hsl(210, 70%, 60%)' },
    name: 'Requests',
  }], [stats]);

  const latencyData = useMemo(() => [
    { y: stats.map(s => s.latencyP50 ?? null) as (number | null)[], name: 'p50', line: { color: 'hsl(210, 70%, 60%)' } },
    { y: stats.map(s => s.latencyP95 ?? null) as (number | null)[], name: 'p95', line: { color: 'hsl(38, 80%, 62%)', dash: 'dash' as const } },
    { y: stats.map(s => s.latencyP99 ?? null) as (number | null)[], name: 'p99', line: { color: 'hsl(345, 50%, 62%)', dash: 'dot' as const } },
  ].map(trace => ({
    type: 'scatter' as const,
    x: stats.map(s => s.hourBucket),
    ...trace,
  })), [stats]);

  const baseLayout = useMemo(() => getPlotlyLayout(isDark), [isDark]);

  /* ---- drift detection ---- */
  const handleDriftCheck = async () => {
    setDriftLoading(true);
    try {
      const report = await runDriftDetection(deployment.deploymentId);
      setDrift(report);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Drift check failed');
    } finally {
      setDriftLoading(false);
    }
  };

  /* ---- error state ---- */
  if (statsError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <AlertTriangle className="h-8 w-8 text-destructive/60" />
        <p className="text-sm font-medium text-foreground">Failed to load monitoring data</p>
        <p className="text-xs text-muted-foreground">{statsError}</p>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => void fetchStats()}>
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const isEmpty = !loading && stats.length === 0;

  return (
    <div className="space-y-6">
      {/* Time range selector — always visible so the user can switch ranges */}
      <div className="flex items-center justify-end gap-3">
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
          {TIME_RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setTimeRange(value)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                timeRange === value
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/50',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state — time range selector stays above */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <div className="h-8 w-8 text-muted-foreground/40">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          </div>
          <p className="text-sm font-medium text-foreground">No monitoring data yet</p>
          <p className="text-xs text-muted-foreground">
            {timeRange === '24h'
              ? 'Make your first prediction in the Playground to start collecting metrics.'
              : `No data in the ${RANGE_LABEL[timeRange]}. Try a wider range.`}
          </p>
        </div>
      ) : <>

      {/* KPI metric grid */}
      {loading ? <MetricSkeleton /> : <MetricGrid cells={metricCells} />}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Request Volume</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <PlotSuspense height={240} loadingLabel="Loading chart…">
              <LazyPlot
                data={volumeData}
                layout={{
                  ...baseLayout,
                  height: 240,
                  yaxis: { ...baseLayout.yaxis as object, title: { text: 'Requests', font: { size: 10 } } },
                }}
                config={PLOTLY_CONFIG}
                style={{ width: '100%' }}
              />
            </PlotSuspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Latency Percentiles</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <PlotSuspense height={240} loadingLabel="Loading chart…">
              <LazyPlot
                data={latencyData}
                layout={{
                  ...baseLayout,
                  height: 240,
                  yaxis: { ...baseLayout.yaxis as object, title: { text: 'ms', font: { size: 10 } } },
                  showlegend: true,
                  legend: { x: 0, y: 1.15, orientation: 'h' as const, font: { size: 10 } },
                }}
                config={PLOTLY_CONFIG}
                style={{ width: '100%' }}
              />
            </PlotSuspense>
          </CardContent>
        </Card>
      </div>

      {/* Drift section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Data Drift</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-2"
              onClick={() => void handleDriftCheck()}
              disabled={driftLoading}
            >
              {driftLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Check Drift
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {drift === null ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Run a drift check to compare current prediction inputs against the training distribution.
            </p>
          ) : !drift.available ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {drift.reason ?? 'Not enough data for drift detection.'}
            </p>
          ) : (
            <div className="space-y-3">
              {drift.overallStatus && (
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn('inline-block h-2.5 w-2.5 rounded-full', DRIFT_STATUS[drift.overallStatus].dot)} />
                  <span className={cn('font-medium', DRIFT_STATUS[drift.overallStatus].text)}>
                    {DRIFT_STATUS[drift.overallStatus].label}
                  </span>
                  {drift.timestamp && (
                    <span className="text-muted-foreground ml-auto">
                      {new Date(drift.timestamp).toLocaleString()}
                    </span>
                  )}
                </div>
              )}

              {drift.features && drift.features.length > 0 && (
                <div className="rounded-md border border-border divide-y divide-border">
                  {drift.features.map(f => {
                    const s = DRIFT_STATUS[f.status];
                    return (
                      <div key={f.feature} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="font-mono text-foreground">{f.feature}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground tabular-nums">PSI {f.psi.toFixed(3)}</span>
                          <span className="flex items-center gap-1.5">
                            <span className={cn('inline-block h-2 w-2 rounded-full', s.dot)} aria-hidden />
                            <span className={cn('font-medium', s.text)}>{s.label}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {drift.predictionDrift && (
                <div className="flex items-center justify-between px-3 py-2 text-xs rounded-md border border-border">
                  <span className="font-medium text-foreground">Prediction Output</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground tabular-nums">PSI {drift.predictionDrift.psi.toFixed(3)}</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn('inline-block h-2 w-2 rounded-full', DRIFT_STATUS[drift.predictionDrift.status].dot)}
                        aria-hidden
                      />
                      <span className={cn('font-medium', DRIFT_STATUS[drift.predictionDrift.status].text)}>
                        {DRIFT_STATUS[drift.predictionDrift.status].label}
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </>}
    </div>
  );
}
