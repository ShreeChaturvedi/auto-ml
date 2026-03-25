/**
 * Model comparison and ranking service
 * Handles comparison of multiple models with metric analysis and statistical significance testing
 */

import type { ComparisonResult } from '../types/experiments.js';

import { welchTTest } from './statisticalTest.js';

export interface ModelForComparison {
  modelId: string;
  name: string;
  metrics: Record<string, number>;
}

/**
 * Compare multiple models and compute metric deltas with statistical significance
 * @param models - Models to compare (must be at least 2)
 * @param evaluations - Map of modelId to evaluation results (for CV scores)
 * @returns Comparison result with models, deltas, and p-values for 2-model comparisons
 */
export function compareModels(
  models: ModelForComparison[],
  evaluations: Map<string, unknown>,
): ComparisonResult {
  if (models.length < 2) {
    throw new Error('At least 2 models are required for comparison');
  }

  // Build models array for result
  const resultModels: ComparisonResult['models'] = models.map((m) => ({
    modelId: m.modelId,
    name: m.name,
    metrics: m.metrics,
  }));

  // Helper to safely extract CV scores from evaluation data
  const getCvScores = (data: unknown): number[] | undefined => {
    if (typeof data === 'object' && data !== null && 'cross_validation' in data) {
      const cv = (data as Record<string, unknown>).cross_validation;
      if (typeof cv === 'object' && cv !== null && 'scores' in cv) {
        const scores = (cv as Record<string, unknown>).scores;
        if (Array.isArray(scores) && scores.every((s) => typeof s === 'number')) {
          return scores as number[];
        }
      }
    }
    return undefined;
  };

  // Compute deltas across all shared metric keys
  const metricKeys = Array.from(new Set(models.flatMap((m) => Object.keys(m.metrics))));
  const deltas: ComparisonResult['deltas'] = metricKeys.map((metric) => {
    const values = models.map((m) => m.metrics[metric] ?? NaN);
    const valid = values.filter((v) => Number.isFinite(v));
    const best = valid.length > 0 ? Math.max(...valid) : 0;
    const worst = valid.length > 0 ? Math.min(...valid) : 0;

    const entry: ComparisonResult['deltas'][number] = {
      metric,
      values,
      delta: best - worst,
    };

    // Compute p-value from cross-validation scores when available for exactly 2 models
    if (models.length === 2) {
      const cvA = getCvScores(evaluations.get(models[0].modelId));
      const cvB = getCvScores(evaluations.get(models[1].modelId));
      if (cvA && cvB && cvA.length >= 2 && cvB.length >= 2) {
        const pVal = welchTTest(cvA, cvB);
        if (Number.isFinite(pVal)) {
          entry.pValue = pVal;
          entry.significant = pVal < 0.05;
        }
      }
    }

    return entry;
  });

  return { models: resultModels, deltas };
}

/**
 * Rank models by a metric
 * @param models - Models to rank
 * @param metricKey - Metric to rank by
 * @param descending - If true, rank highest values first (default: true)
 * @returns Models sorted by metric value
 */
export function rankModelsByMetric(
  models: ModelForComparison[],
  metricKey: string,
  descending = true,
): ModelForComparison[] {
  return [...models].sort((a, b) => {
    const aVal = a.metrics[metricKey] ?? 0;
    const bVal = b.metrics[metricKey] ?? 0;
    return descending ? bVal - aVal : aVal - bVal;
  });
}

/**
 * Find the best model by a metric
 * @param models - Models to search
 * @param metricKey - Metric to optimize
 * @param descending - If true, find max value (default: true)
 * @returns The best model or undefined if no models provided
 */
export function findBestModel(
  models: ModelForComparison[],
  metricKey: string,
  descending = true,
): ModelForComparison | undefined {
  if (models.length === 0) return undefined;
  return rankModelsByMetric(models, metricKey, descending)[0];
}
