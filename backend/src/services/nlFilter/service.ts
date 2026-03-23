import type { ModelRecord } from '../../types/model.js';
import { percentile } from '../eda/numericAnalysis.js';

export interface MetricStats {
  min: number;
  max: number;
  p25: number;
  median: number;
  p75: number;
}

export interface NlFilterContext {
  metricFields: string[];
  algorithms: string[];
  taskTypes: string[];
  metricRanges: Record<string, { min: number; max: number }>;
  metricStats: Record<string, MetricStats>;
}

function computeMetricStats(values: number[]): MetricStats | null {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p25: percentile(sorted, 25),
    median: percentile(sorted, 50),
    p75: percentile(sorted, 75),
  };
}

export function buildNlFilterContext(models: ModelRecord[]): NlFilterContext {
  const completed = models.filter((m) => m.status === 'completed');

  const metricFieldSet = new Set<string>();
  const algorithmSet = new Set<string>();
  const taskTypeSet = new Set<string>();
  const metricValues: Record<string, number[]> = {};

  for (const model of completed) {
    algorithmSet.add(model.algorithm);
    taskTypeSet.add(model.taskType);

    for (const [key, val] of Object.entries(model.metrics)) {
      metricFieldSet.add(key);
      (metricValues[key] ??= []).push(val);
    }
  }

  const metricRanges: Record<string, { min: number; max: number }> = {};
  const metricStats: Record<string, MetricStats> = {};
  for (const [key, values] of Object.entries(metricValues)) {
    const stats = computeMetricStats(values);
    if (stats) {
      metricRanges[key] = { min: stats.min, max: stats.max };
      metricStats[key] = stats;
    }
  }

  return {
    metricFields: [...metricFieldSet],
    algorithms: [...algorithmSet],
    taskTypes: [...taskTypeSet],
    metricRanges,
    metricStats,
  };
}

export function buildNlFilterPrompt(ctx: NlFilterContext): string {
  const metricList = ctx.metricFields.length > 0
    ? ctx.metricFields.join(', ')
    : 'accuracy, f1, precision, recall, rmse, mae, r2, silhouette';

  const algoList = ctx.algorithms.length > 0
    ? ctx.algorithms.map((a) => `"${a}"`).join(', ')
    : 'none available';

  const taskList = ctx.taskTypes.length > 0
    ? ctx.taskTypes.join(', ')
    : 'classification, regression, clustering';

  let statsSection = '';
  if (Object.keys(ctx.metricStats).length > 0) {
    const fmt = (n: number) => n.toFixed(4);
    const statsLines = Object.entries(ctx.metricStats)
      .map(([k, s]) => `  ${k}: min=${fmt(s.min)}, p25=${fmt(s.p25)}, median=${fmt(s.median)}, p75=${fmt(s.p75)}, max=${fmt(s.max)}`)
      .join('\n');
    statsSection = `\nMETRIC STATISTICS (use these precomputed thresholds for relative terms):
${statsLines}
- "high"/"good"/"top" → use gte with the p75 value
- "low"/"poor"/"worst" → use lte with the p25 value
- Ambiguous values like "90" vs "0.9": if max <= 1 the metric is a ratio, so 90 means 0.90
`;
  }

  const exampleAlgo = ctx.algorithms[0] ?? 'RandomForestClassifier';
  const accStats = ctx.metricStats['accuracy'];
  const highExample = accStats
    ? `"high accuracy" → { "predicates": [{ "field": "accuracy", "operator": "gte", "value": ${accStats.p75.toFixed(4)} }] }`
    : `"high accuracy" → { "predicates": [{ "field": "accuracy", "operator": "gte", "value": 0.85 }] }`;

  return `You parse natural language queries into structured filter predicates for an ML experiment leaderboard.

Return JSON: { "predicates": [{ "field": "...", "operator": "...", "value": ... }] }
Only return empty predicates if the query is completely unrelated to filtering (e.g., "hello", "what is ML?").
For vague or relative queries ("high accuracy", "best models"), always produce a concrete numeric predicate using the metric statistics below.

FILTERABLE FIELDS:
- Metrics (numeric, support gt/lt/gte/lte/eq): ${metricList}
- "algorithm" (string, use "contains" or "eq"): values in this project: ${algoList}
- "name" (string, use "contains"): model name substring match
- "taskType" (string, use "eq"): ${taskList}
- "status" (string, use "eq"): "completed" or "failed"

OPERATORS: gt (>), lt (<), gte (>=), lte (<=), eq (=), contains (substring match)
${statsSection}
EXAMPLES:
- "accuracy above 90%" → { "predicates": [{ "field": "accuracy", "operator": "gt", "value": 0.9 }] }
- "random forest models" → { "predicates": [{ "field": "algorithm", "operator": "contains", "value": "${exampleAlgo}" }] }
- ${highExample}`;
}
