import { useMemo, useState, useCallback } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { Radar as RadarIcon, BarChart3 } from 'lucide-react';
import type { ModelRecord } from '@/types/model';
import { PRIMARY_METRIC } from './utils';
import { getEdaColors, useIsDark } from '@/components/data/eda/edaTheme';
import { Button } from '@/components/ui/button';

/* ── Constants ──────────────────────────────────────────────────────── */

const BAR_THRESHOLD = 7;
const ANIMATION_MS = 600;
const GRID_STROKE = 'rgba(255,255,255,0.08)';
const AXIS_MUTED = 'rgba(255,255,255,0.4)';
const AXIS_MUTED_LIGHT = 'rgba(0,0,0,0.4)';

/* ── Helpers ────────────────────────────────────────────────────────── */

function formatMetricName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

/* ── Custom tooltip ─────────────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-foreground mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-mono text-foreground">{entry.value.toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Data transforms ────────────────────────────────────────────────── */

function buildRadarData(models: ModelRecord[], metricKeys: string[]) {
  // Compute min/max per metric for 0-1 normalization
  const ranges = metricKeys.map((key) => {
    const vals = models.map((m) => m.metrics[key]).filter((v) => v != null && Number.isFinite(v));
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 1;
    return { key, min, max };
  });

  return ranges.map(({ key, min, max }) => {
    const row: Record<string, string | number> = { metric: formatMetricName(key) };
    for (const m of models) {
      const raw = m.metrics[key];
      row[m.name] = raw != null && Number.isFinite(raw)
        ? (max === min ? 1 : (raw - min) / (max - min))
        : 0;
    }
    return row;
  });
}

function buildBarData(models: ModelRecord[], metricKeys: string[], primaryKey: string) {
  // Sort by primary metric descending (best on top)
  const sorted = [...models].sort(
    (a, b) => (b.metrics[primaryKey] ?? 0) - (a.metrics[primaryKey] ?? 0),
  );
  return sorted.map((m) => {
    const row: Record<string, string | number> = { name: m.name };
    for (const key of metricKeys) row[formatMetricName(key)] = m.metrics[key] ?? 0;
    return row;
  });
}

/* ── Component ──────────────────────────────────────────────────────── */

export function ModelComparisonChart({ models }: { models: ModelRecord[] }) {
  const isDark = useIsDark();
  const colors = useMemo(() => getEdaColors(isDark), [isDark]);
  const axisTick = isDark ? AXIS_MUTED : AXIS_MUTED_LIGHT;

  const autoBar = models.length >= BAR_THRESHOLD;
  const [modeOverride, setModeOverride] = useState<'radar' | 'bar' | null>(null);
  const isBar = modeOverride ? modeOverride === 'bar' : autoBar;
  const toggleMode = useCallback(() => setModeOverride(isBar ? 'radar' : 'bar'), [isBar]);

  // Hidden models for legend toggle
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleModel = useCallback((name: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const metricKeys = useMemo(
    () => Array.from(new Set(models.flatMap((m) => Object.keys(m.metrics)))),
    [models],
  );
  const formattedKeys = useMemo(() => metricKeys.map(formatMetricName), [metricKeys]);

  // Only compute the transform for the active chart view
  const radarData = useMemo(
    () => (isBar ? [] : buildRadarData(models, metricKeys)),
    [models, metricKeys, isBar],
  );
  const barData = useMemo(() => {
    if (!isBar) return [];
    const taskTypes = Array.from(new Set(models.map((m) => m.taskType)));
    const pk = PRIMARY_METRIC[taskTypes[0]] ?? metricKeys[0] ?? 'accuracy';
    return buildBarData(models, metricKeys, pk);
  }, [models, metricKeys, isBar]);

  // Empty state
  if (models.length < 2) {
    return (
      <div className="rounded-lg border border-border shadow-sm dark:shadow-none bg-card/50 p-4">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Model Comparison</h3>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Add at least 2 models to compare
        </p>
      </div>
    );
  }

  const barHeight = Math.max(200, models.length * 48 + 60);

  return (
    <div className="rounded-lg border border-border shadow-sm dark:shadow-none bg-card/50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Model Comparison</h3>
        <Button variant="ghost" size="icon-sm" onClick={toggleMode} title={isBar ? 'Radar view' : 'Bar view'}>
          {isBar ? <RadarIcon className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
        </Button>
      </div>

      {/* Chart */}
      {isBar ? (
        <div className="max-h-[400px] overflow-y-auto">
          <ResponsiveContainer width="100%" height={barHeight}>
            <BarChart layout="vertical" data={barData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={{ fill: axisTick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category" dataKey="name" width={100} axisLine={false} tickLine={false}
                tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                  <text x={x} y={y} dy={4} textAnchor="end" fill={axisTick} fontSize={11}>
                    {truncate(payload.value, 16)}
                  </text>
                )}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
              <Legend />
              {formattedKeys.map((name, i) => (
                <Bar
                  key={name} dataKey={name} fill={colors[i % colors.length]}
                  barSize={10} isAnimationActive animationDuration={ANIMATION_MS}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid gridType="polygon" stroke={GRID_STROKE} />
            <PolarAngleAxis
              dataKey="metric" tick={{ fill: axisTick, fontSize: 11 }}
            />
            <PolarRadiusAxis angle={90} domain={[0, 1]} tick={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              onClick={(e) => {
                if (e && typeof e.value === 'string') toggleModel(e.value);
              }}
              formatter={(value: string) => (
                <span className={hidden.has(value) ? 'line-through opacity-50' : ''}>{value}</span>
              )}
            />
            {models.map((m, i) =>
              hidden.has(m.name) ? null : (
                <Radar
                  key={m.modelId} name={m.name} dataKey={m.name}
                  stroke={colors[i % colors.length]} fill={colors[i % colors.length]}
                  fillOpacity={0.15}
                  isAnimationActive animationDuration={ANIMATION_MS}
                />
              ),
            )}
          </RadarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
