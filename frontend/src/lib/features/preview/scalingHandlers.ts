/**
 * Preview handlers for scaling methods:
 * standardize, min_max_scale, robust_scale, max_abs_scale.
 */

import type { FeatureMethod } from '@/types/feature';
import { buildNumericStats } from '@/lib/stats';
import type { PreviewContext, PreviewFn, Row } from './types';
import { coerceNumber } from './helpers';

const scalingHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, params, sourceColumn, addOutputValue, getSource } = ctx;

  const numericStats = buildNumericStats(sample, sourceColumn, coerceNumber);

  const outputColumns = [feature.featureName];
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const numericVal = coerceNumber(getSource(row));
    let value: unknown = null;

    switch (feature.method) {
      case 'standardize':
        if (numericStats && numericVal !== null && numericStats.stdDev > 0) {
          value = (numericVal - numericStats.mean) / numericStats.stdDev;
        }
        break;
      case 'min_max_scale': {
        if (numericStats && numericVal !== null && numericStats.max !== numericStats.min) {
          const min = Number(params.min ?? 0);
          const max = Number(params.max ?? 1);
          value =
            ((numericVal - numericStats.min) / (numericStats.max - numericStats.min)) *
              (max - min) +
            min;
        }
        break;
      }
      case 'robust_scale': {
        if (numericStats && numericVal !== null && numericStats.q3 !== numericStats.q1) {
          value = (numericVal - numericStats.median) / (numericStats.q3 - numericStats.q1);
        }
        break;
      }
      case 'max_abs_scale':
        if (numericStats && numericVal !== null && numericStats.maxAbs > 0) {
          value = numericVal / numericStats.maxAbs;
        }
        break;
      default:
        break;
    }

    addOutputValue(outputRow, feature.featureName, value);
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows };
};

export const SCALING_METHODS: FeatureMethod[] = [
  'standardize',
  'min_max_scale',
  'robust_scale',
  'max_abs_scale',
];

export const scalingHandlers: Map<FeatureMethod, PreviewFn> = new Map();

for (const method of SCALING_METHODS) {
  scalingHandlers.set(method, scalingHandler);
}
