import { useMemo, useId } from 'react';
import type { ModelRecord } from '@/types/model';
import type { EvaluationResult } from '@/types/experiments';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { cn } from '@/lib/utils';
import {
  PRIMARY_METRIC,
  PRIMARY_METRIC_LABEL,
  formatMetric,
  formatDuration,
  detectTaskTypes,
} from './utils';

/* ── Section link map ─────────────────────────────────────── */

const CARD_SECTION_MAP: Record<string, string> = {
  'best-score': 'report-executive-summary',
  'score-trend': 'report-model-performance-rankings',
  'models-trained': 'report-model-performance-rankings',
  'avg-training-time': 'report-training-efficiency',
  'overfit-risk': 'report-potential-issues',
  'algo-diversity': 'report-metric-by-metric-analysis',
  'metric-spread': 'report-potential-issues',
  convergence: 'report-recommendations',
};

/* ── Sparkline SVG ────────────────────────────────────────── */

function Sparkline({ values, color = 'text-primary/60' }: { values: number[]; color?: string }) {
  const uid = useId();
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 120;
  const H = 32;
  const pad = 1; // stroke padding

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const fill = `${line} L${W},${H} L0,${H} Z`;

  // Approximate path length: sum of segment lengths
  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    pathLen += Math.sqrt(dx * dx + dy * dy);
  }

  const gradId = `spark-${uid}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('w-full block', color)}
      style={{ height: 32 }}
      overflow="hidden"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.15} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="sparkline-draw"
        style={{ strokeDasharray: pathLen, strokeDashoffset: pathLen }}
      />
    </svg>
  );
}

/* ── Mini bar chart ───────────────────────────────────────── */

function MiniBars({ items }: { items: { label: string; value: number }[] }) {
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex items-end gap-[2px] h-8 overflow-hidden">
      {items.slice(0, 6).map((item) => (
        <div key={item.label} className="flex-1 flex flex-col items-center min-w-0">
          <div
            className="w-full max-w-[10px] rounded-t-[1px] bg-primary/35"
            style={{ height: `${Math.max((item.value / maxVal) * 22, 2)}px` }}
          />
          <span className="text-[7px] text-muted-foreground/50 truncate w-full text-center mt-px leading-none">
            {item.label.slice(0, 5)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Progress bar ─────────────────────────────────────────── */

function ProgressBar({ ratio }: { ratio: number }) {
  return (
    <div className="h-[3px] w-full bg-muted/20 rounded-full overflow-hidden">
      <div
        className="h-full bg-primary/45 rounded-full transition-all duration-700"
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }}
      />
    </div>
  );
}

/* ── Two-bar comparison ───────────────────────────────────── */

function TwoBars({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const maxVal = Math.max(a, b, 0.01);
  return (
    <div className="flex items-end gap-2 h-8 overflow-hidden">
      {[{ v: a, l: labelA }, { v: b, l: labelB }].map((bar) => (
        <div key={bar.l} className="flex-1 flex flex-col items-center min-w-0">
          <div
            className="w-full max-w-[16px] rounded-t-[1px] bg-primary/35"
            style={{ height: `${Math.max((bar.v / maxVal) * 20, 2)}px` }}
          />
          <span className="text-[7px] text-muted-foreground/50 mt-px leading-none">{bar.l}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Range bar (min-max overlay) ──────────────────────────── */

function RangeBar({ min, max, total }: { min: number; max: number; total: number }) {
  const rng = total || 1;
  const left = (min / rng) * 100;
  const width = ((max - min) / rng) * 100;
  return (
    <div className="h-[4px] w-full bg-muted/15 rounded-full relative overflow-hidden">
      <div
        className="absolute h-full bg-primary/40 rounded-full transition-all duration-700"
        style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
      />
    </div>
  );
}

/* ── Animated value display ───────────────────────────────── */

function AnimatedNum({ value, format }: { value: number; format: (n: number) => string }) {
  const animated = useAnimatedValue(value);
  return <>{format(animated)}</>;
}

/* ── Card definition ──────────────────────────────────────── */

interface CardDef {
  id: string;
  label: string;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  viz: React.ReactNode;
}

/* ── Single card cell ─────────────────────────────────────── */

function KpiCell({
  card,
  index,
  onClick,
}: {
  card: CardDef;
  index: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col text-left p-3.5 gap-0.5 overflow-hidden',
        'border-b border-r border-border/50',
        '[&:nth-child(even)]:border-r-0',
        '[&:nth-last-child(-n+2)]:border-b-0',
        'transition-colors duration-150 hover:bg-muted/20',
        'card-enter focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 leading-none">
        {card.label}
      </span>
      <span className="text-xl font-semibold text-foreground tabular-nums leading-tight">
        {card.primary}
      </span>
      <span className="text-xs text-muted-foreground/60 leading-snug truncate w-full">
        {card.secondary}
      </span>
      <div className="mt-auto pt-1.5 w-full">
        {card.viz}
      </div>
    </button>
  );
}

/* ── Props ────────────────────────────────────────────────── */

interface InsightGridProps {
  models: ModelRecord[];
  evaluations: Record<string, EvaluationResult | null>;
  onCardClick?: (sectionSlug: string) => void;
}

/* ── Main component ───────────────────────────────────────── */

export function InsightGrid({ models, evaluations, onCardClick }: InsightGridProps) {
  const sorted = useMemo(
    () => [...models].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [models],
  );
  const taskTypes = useMemo(() => detectTaskTypes(models), [models]);
  const primaryTask = taskTypes[0] ?? 'classification';
  const metricKey = PRIMARY_METRIC[primaryTask];
  const metricLabel = PRIMARY_METRIC_LABEL[primaryTask];

  const scores = useMemo(
    () => sorted.map((m) => m.metrics[metricKey]).filter((v): v is number => v != null && Number.isFinite(v)),
    [sorted, metricKey],
  );

  /* ── 1. Best Score ── */
  const bestIdx = useMemo(() => {
    let idx = -1, best = -Infinity;
    for (let i = 0; i < models.length; i++) {
      const v = models[i].metrics[metricKey];
      if (v != null && v > best) { best = v; idx = i; }
    }
    return idx;
  }, [models, metricKey]);
  const bestModel = bestIdx >= 0 ? models[bestIdx] : null;
  const bestScore = bestModel ? bestModel.metrics[metricKey] : 0;

  /* ── 2. Score Trend ── */
  const { trendDelta, bestSoFar } = useMemo(() => {
    if (scores.length < 2) return { trendDelta: null, bestSoFar: [] as number[] };
    let running = -Infinity;
    const curve = scores.map((s) => { running = Math.max(running, s); return running; });
    return { trendDelta: curve[curve.length - 1] - curve[0], bestSoFar: curve };
  }, [scores]);

  /* ── 3. Models Trained ── */
  const algoBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of models) map[m.algorithm] = (map[m.algorithm] ?? 0) + 1;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [models]);

  /* ── 4. Avg Training Time ── */
  const { avgMs, fastestModel, timeSeries } = useMemo(() => {
    const withTime = sorted.filter((m) => m.trainingMs != null);
    if (withTime.length === 0) return { avgMs: null, fastestModel: null, timeSeries: [] };
    const total = withTime.reduce((s, m) => s + (m.trainingMs ?? 0), 0);
    const fastest = withTime.reduce((a, b) => ((a.trainingMs ?? Infinity) < (b.trainingMs ?? Infinity) ? a : b));
    return {
      avgMs: total / withTime.length,
      fastestModel: fastest,
      timeSeries: withTime.map((m) => m.trainingMs ?? 0),
    };
  }, [sorted]);

  /* ── 5. Overfit Risk ── */
  const overfit = useMemo(() => {
    if (!bestModel) return null;
    const ev = evaluations[bestModel.modelId];
    if (!ev?.learning_curve) return null;
    const { train_scores_mean, test_scores_mean } = ev.learning_curve;
    if (!train_scores_mean.length || !test_scores_mean.length) return null;
    const trainLast = train_scores_mean[train_scores_mean.length - 1];
    const testLast = test_scores_mean[test_scores_mean.length - 1];
    const gap = trainLast - testLast;
    const level = gap > 0.1 ? 'High' : gap > 0.04 ? 'Med' : 'Low';
    return { level, gap, trainLast, testLast };
  }, [bestModel, evaluations]);

  /* ── 6. Algo Diversity (derived from algoBreakdown — no extra pass) ── */
  const uniqueAlgoCount = algoBreakdown.length;

  /* ── 7. Metric Spread ── */
  const spread = useMemo(() => {
    if (scores.length < 2) return null;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    return { min, max, range: max - min };
  }, [scores]);

  /* ── 8. Convergence ── */
  const convergence = useMemo(() => {
    if (scores.length < 3) return null;
    const last3 = scores.slice(-3);
    const deltas = [last3[1] - last3[0], last3[2] - last3[1]];
    const avgDelta = (deltas[0] + deltas[1]) / 2;
    const status = avgDelta > 0.001 ? 'Improving' : avgDelta < -0.001 ? 'Declining' : 'Plateaued';
    const allDeltas = scores.slice(1).map((s, i) => s - scores[i]);
    return { status, avgDelta, deltas: allDeltas };
  }, [scores]);

  if (models.length === 0) return null;

  const cards: CardDef[] = [
    {
      id: 'best-score',
      label: `Best ${metricLabel}`,
      primary: bestModel ? <AnimatedNum value={bestScore} format={formatMetric} /> : '\u2014',
      secondary: bestModel?.name ?? 'No models',
      viz: <ProgressBar ratio={bestScore} />,
    },
    {
      id: 'score-trend',
      label: 'Score Trend',
      primary:
        trendDelta != null ? (
          <span className={trendDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
            {trendDelta >= 0 ? '+' : ''}
            <AnimatedNum value={trendDelta * 100} format={(n) => `${n.toFixed(1)}%`} />
          </span>
        ) : '\u2014',
      secondary: trendDelta != null ? `across ${scores.length} experiments` : 'Need 2+ models',
      viz: <Sparkline values={bestSoFar} />,
    },
    {
      id: 'models-trained',
      label: 'Models Trained',
      primary: <AnimatedNum value={models.length} format={(n) => String(Math.round(n))} />,
      secondary: `${algoBreakdown.length} algorithm${algoBreakdown.length !== 1 ? 's' : ''}`,
      viz: <MiniBars items={algoBreakdown} />,
    },
    {
      id: 'avg-training-time',
      label: 'Avg Training Time',
      primary: avgMs != null ? <AnimatedNum value={avgMs} format={formatDuration} /> : '\u2014',
      secondary: fastestModel
        ? `Fastest: ${formatDuration(fastestModel.trainingMs ?? 0)} (${fastestModel.name})`
        : 'No timing data',
      viz: <Sparkline values={timeSeries} />,
    },
    {
      id: 'overfit-risk',
      label: 'Overfit Risk',
      primary: overfit ? (
        <span className={cn(
          overfit.level === 'Low' && 'text-emerald-400',
          overfit.level === 'Med' && 'text-amber-400',
          overfit.level === 'High' && 'text-red-400',
        )}>
          {overfit.level}
        </span>
      ) : '\u2014',
      secondary: overfit ? `Gap: ${(overfit.gap * 100).toFixed(1)}%` : 'No eval data',
      viz: overfit
        ? <TwoBars a={overfit.trainLast} b={overfit.testLast} labelA="Train" labelB="Test" />
        : <div className="h-8" />,
    },
    {
      id: 'algo-diversity',
      label: 'Algo Diversity',
      primary: (
        <>
          <AnimatedNum value={uniqueAlgoCount} format={(n) => String(Math.round(n))} />
          <span className="text-sm font-normal text-muted-foreground/60 ml-1">
            type{uniqueAlgoCount !== 1 ? 's' : ''}
          </span>
        </>
      ),
      secondary: algoBreakdown.slice(0, 2).map((a) => a.label).join(', ') || '\u2014',
      viz: <MiniBars items={algoBreakdown} />,
    },
    {
      id: 'metric-spread',
      label: 'Metric Spread',
      primary: spread ? <AnimatedNum value={spread.range} format={formatMetric} /> : '\u2014',
      secondary: spread ? `${formatMetric(spread.min)} \u2013 ${formatMetric(spread.max)}` : 'Need 2+ models',
      viz: spread ? <RangeBar min={spread.min} max={spread.max} total={1} /> : <div className="h-1" />,
    },
    {
      id: 'convergence',
      label: 'Convergence',
      primary: convergence ? (
        <span className={cn(
          convergence.status === 'Improving' && 'text-emerald-400',
          convergence.status === 'Plateaued' && 'text-muted-foreground',
          convergence.status === 'Declining' && 'text-amber-400',
        )}>
          {convergence.status}
        </span>
      ) : '\u2014',
      secondary: convergence
        ? `Last 3: ${convergence.avgDelta >= 0 ? '+' : ''}${(convergence.avgDelta * 100).toFixed(1)}%`
        : 'Need 3+ models',
      viz: convergence ? <Sparkline values={convergence.deltas} /> : <div className="h-8" />,
    },
  ];

  return (
    <div className="grid grid-cols-2 rounded-xl border border-border/50 overflow-hidden">
      {cards.map((card, i) => (
        <KpiCell
          key={card.id}
          card={card}
          index={i}
          onClick={onCardClick ? () => onCardClick(CARD_SECTION_MAP[card.id]) : undefined}
        />
      ))}
    </div>
  );
}
