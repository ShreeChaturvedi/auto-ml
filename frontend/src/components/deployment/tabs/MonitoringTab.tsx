import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Activity, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LazyPlot, getPlotlyLayout, useIsDark, PLOTLY_CONFIG } from '@/components/data/eda/edaTheme';
import { PlotSuspense } from '@/components/data/eda/PlotSuspense';
import { Sparkline } from '@/components/experiments/charts/Sparkline';
import type { DeploymentRecord, DeploymentStatsHourly, DriftReport } from '@/types/deployment';
import { getDeploymentStats, runDriftDetection } from '@/lib/api/deployments';
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
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests * 100) : 0;
  return { totalRequests, avgLatency, errorRate, totalErrors };
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

  /* ---- fetch stats ---- */
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDeploymentStats(deployment.deploymentId, timeRange);
      setStats(res.stats);
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

  /* ---- sparkline data ---- */
  const requestSparkline = useMemo(() => stats.map(s => s.requestCount), [stats]);
  const latencySparkline = useMemo(() => stats.map(s => s.latencyAvg ?? 0), [stats]);
  const errorSparkline = useMemo(() => {
    return stats.map(s => s.requestCount > 0 ? (s.errorCount / s.requestCount * 100) : 0);
  }, [stats]);
  const uptimeSparkline = useMemo(() => {
    return stats.map(s => s.requestCount === 0 ? 100 : ((s.requestCount - s.errorCount) / s.requestCount) * 100);
  }, [stats]);

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
    } finally {
      setDriftLoading(false);
    }
  };

  /* ---- empty state ---- */
  if (!loading && stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
        <Activity className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">No monitoring data yet</p>
        <p className="text-xs text-muted-foreground">
          Make your first prediction in the Playground to start collecting metrics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex items-center gap-3">
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
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Requests"
          value={kpis.totalRequests.toLocaleString()}
          icon={<Activity className="h-4 w-4" />}
          sparkline={requestSparkline}
        />
        <KpiCard
          title="Avg Latency"
          value={`${kpis.avgLatency}ms`}
          icon={<Clock className="h-4 w-4" />}
          sparkline={latencySparkline}
          sparkColor="text-amber-500/60"
        />
        <KpiCard
          title="Error Rate"
          value={`${kpis.errorRate.toFixed(1)}%`}
          icon={<AlertTriangle className="h-4 w-4" />}
          sparkline={errorSparkline}
          sparkColor="text-red-500/60"
        />
        <KpiCard
          title="Uptime"
          value={`${uptime}%`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          sparkline={uptimeSparkline}
          sparkColor="text-emerald-500/60"
        />
      </div>

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
              onClick={handleDriftCheck}
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
              {/* Overall status */}
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

              {/* Per-feature PSI */}
              {drift.features && drift.features.length > 0 && (
                <div className="rounded-md border border-border divide-y divide-border">
                  {drift.features.map(f => {
                    const s = DRIFT_STATUS[f.status];
                    return (
                      <div key={f.feature} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="font-mono text-foreground">{f.feature}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground tabular-nums">
                            PSI {f.psi.toFixed(3)}
                          </span>
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

              {/* Prediction drift */}
              {drift.predictionDrift && (
                <div className="flex items-center justify-between px-3 py-2 text-xs rounded-md border border-border">
                  <span className="font-medium text-foreground">Prediction Output</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground tabular-nums">
                      PSI {drift.predictionDrift.psi.toFixed(3)}
                    </span>
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI card sub-component                                             */
/* ------------------------------------------------------------------ */

function KpiCard({
  title,
  value,
  icon,
  sparkline,
  sparkColor,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  sparkline: number[];
  sparkColor?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{title}</span>
          <span className="text-muted-foreground/60">{icon}</span>
        </div>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        <Sparkline values={sparkline} color={sparkColor} />
      </CardContent>
    </Card>
  );
}
