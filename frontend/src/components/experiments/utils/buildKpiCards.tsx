import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatMetric, formatDuration } from '../utils';
import { ProgressBar } from '../charts/ProgressBar';
import { Sparkline } from '../charts/Sparkline';
import { MiniBars } from '../charts/MiniBars';
import { TwoBars } from '../charts/TwoBars';
import { RangeBar } from '../charts/RangeBar';
import { AnimatedNum } from '../AnimatedNum';
import type { ModelRecord } from '@/types/model';

interface CardDef {
  id: string;
  label: string;
  primary: ReactNode;
  secondary: ReactNode;
  viz: ReactNode;
}

interface KpiMetrics {
  metricLabel: string;
  bestModel: ModelRecord | null;
  bestScore: number;
  trendDelta: number | null;
  bestSoFar: number[];
  algoBreakdown: { label: string; value: number }[];
  avgMs: number | null;
  fastestModel: ModelRecord | null;
  timeSeries: number[];
  overfit: { level: string; gap: number; trainLast: number; testLast: number } | null;
  uniqueAlgoCount: number;
  spread: { min: number; max: number; range: number } | null;
  convergence: { status: string; avgDelta: number; deltas: number[] } | null;
}

export function buildKpiCards(kpis: KpiMetrics): CardDef[] {
  return [
    {
      id: 'best-score',
      label: `Best ${kpis.metricLabel}`,
      primary: kpis.bestModel ? <AnimatedNum value={kpis.bestScore} format={formatMetric} /> : '—',
      secondary: kpis.bestModel?.name ?? 'No models',
      viz: <ProgressBar ratio={kpis.bestScore} />,
    },
    {
      id: 'score-trend',
      label: 'Score Trend',
      primary:
        kpis.trendDelta != null ? (
          <span className={kpis.trendDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
            {kpis.trendDelta >= 0 ? '+' : ''}
            <AnimatedNum value={kpis.trendDelta * 100} format={(n) => `${n.toFixed(1)}%`} />
          </span>
        ) : '—',
      secondary: kpis.trendDelta != null ? `across ${kpis.bestSoFar.length} experiments` : 'Need 2+ models',
      viz: <Sparkline values={kpis.bestSoFar} />,
    },
    {
      id: 'models-trained',
      label: 'Models Trained',
      primary: <AnimatedNum value={kpis.algoBreakdown.reduce((sum, a) => sum + a.value, 0)} format={(n) => String(Math.round(n))} />,
      secondary: `${kpis.algoBreakdown.length} algorithm${kpis.algoBreakdown.length !== 1 ? 's' : ''}`,
      viz: <MiniBars items={kpis.algoBreakdown} />,
    },
    {
      id: 'avg-training-time',
      label: 'Avg Training Time',
      primary: kpis.avgMs != null ? <AnimatedNum value={kpis.avgMs} format={formatDuration} /> : '—',
      secondary: kpis.fastestModel
        ? `Fastest: ${formatDuration(kpis.fastestModel.trainingMs ?? 0)} (${kpis.fastestModel.name})`
        : 'No timing data',
      viz: <Sparkline values={kpis.timeSeries} />,
    },
    {
      id: 'overfit-risk',
      label: 'Overfit Risk',
      primary: kpis.overfit ? (
        <span
          className={cn(
            kpis.overfit.level === 'Low' && 'text-emerald-400',
            kpis.overfit.level === 'Med' && 'text-amber-400',
            kpis.overfit.level === 'High' && 'text-red-400'
          )}
        >
          {kpis.overfit.level}
        </span>
      ) : (
        '—'
      ),
      secondary: kpis.overfit ? `Gap: ${(kpis.overfit.gap * 100).toFixed(1)}%` : 'No eval data',
      viz: kpis.overfit ? (
        <TwoBars a={kpis.overfit.trainLast} b={kpis.overfit.testLast} labelA="Train" labelB="Test" />
      ) : (
        <div className="h-8" />
      ),
    },
    {
      id: 'algo-diversity',
      label: 'Algo Diversity',
      primary: (
        <>
          <AnimatedNum value={kpis.uniqueAlgoCount} format={(n) => String(Math.round(n))} />
          <span className="text-sm font-normal text-muted-foreground/60 ml-1">
            type{kpis.uniqueAlgoCount !== 1 ? 's' : ''}
          </span>
        </>
      ),
      secondary: kpis.algoBreakdown.slice(0, 2).map((a) => a.label).join(', ') || '—',
      viz: <MiniBars items={kpis.algoBreakdown} />,
    },
    {
      id: 'metric-spread',
      label: 'Metric Spread',
      primary: kpis.spread ? <AnimatedNum value={kpis.spread.range} format={formatMetric} /> : '—',
      secondary: kpis.spread ? `${formatMetric(kpis.spread.min)} – ${formatMetric(kpis.spread.max)}` : 'Need 2+ models',
      viz: kpis.spread ? <RangeBar min={kpis.spread.min} max={kpis.spread.max} total={1} /> : <div className="h-1" />,
    },
    {
      id: 'convergence',
      label: 'Convergence',
      primary: kpis.convergence ? (
        <span
          className={cn(
            kpis.convergence.status === 'Improving' && 'text-emerald-400',
            kpis.convergence.status === 'Plateaued' && 'text-muted-foreground',
            kpis.convergence.status === 'Declining' && 'text-amber-400'
          )}
        >
          {kpis.convergence.status}
        </span>
      ) : (
        '—'
      ),
      secondary: kpis.convergence
        ? `Last 3: ${kpis.convergence.avgDelta >= 0 ? '+' : ''}${(kpis.convergence.avgDelta * 100).toFixed(1)}%`
        : 'Need 3+ models',
      viz: kpis.convergence ? <Sparkline values={kpis.convergence.deltas} /> : <div className="h-8" />,
    },
  ];
}
