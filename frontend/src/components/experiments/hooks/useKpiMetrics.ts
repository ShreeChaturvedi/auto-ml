import { useMemo } from 'react';
import type { ModelRecord } from '@/types/model';
import type { EvaluationResult } from '@/types/experiments';
import { PRIMARY_METRIC, PRIMARY_METRIC_LABEL, detectTaskTypes } from '../utils';

export function useKpiMetrics(
  models: ModelRecord[],
  evaluations: Record<string, EvaluationResult | null>
) {
  const sorted = useMemo(
    () => [...models].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [models]
  );

  const taskTypes = useMemo(() => detectTaskTypes(models), [models]);
  const primaryTask = taskTypes[0] ?? 'classification';
  const metricKey = PRIMARY_METRIC[primaryTask];
  const metricLabel = PRIMARY_METRIC_LABEL[primaryTask];

  const scores = useMemo(
    () => sorted.map((m) => m.metrics[metricKey]).filter((v): v is number => v != null && Number.isFinite(v)),
    [sorted, metricKey]
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

  /* ── 3. Models Trained (algo breakdown) ── */
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

  /* ── 6. Algo Diversity ── */
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

  return {
    metricLabel,
    bestModel,
    bestScore,
    trendDelta,
    bestSoFar,
    algoBreakdown,
    avgMs,
    fastestModel,
    timeSeries,
    overfit,
    uniqueAlgoCount,
    spread,
    convergence,
  };
}
