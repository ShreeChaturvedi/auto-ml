/**
 * Preview handlers for binning methods:
 * bucketize (equal-width), quantile_bin.
 */

import type { FeatureMethod } from '@/types/feature';
import { buildNumericStats } from '@/lib/stats';
import type { PreviewContext, PreviewFn, Row } from './types';
import { coerceNumber, buildBins, buildQuantiles, findBin } from './helpers';

const binningHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, params, sourceColumn, addOutputValue, getSource } = ctx;

  const numericStats = buildNumericStats(sample, sourceColumn, coerceNumber);
  const quantiles = numericStats ? buildQuantiles(numericStats.values) : null;

  const outputColumns = [feature.featureName];
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const numericVal = coerceNumber(getSource(row));
    let value: unknown = null;

    switch (feature.method) {
      case 'bucketize': {
        if (numericStats && numericVal !== null) {
          const bins = Math.max(2, Number(params.bins ?? 5));
          const edges = buildBins(numericStats.min, numericStats.max, bins);
          value = findBin(numericVal, edges);
        }
        break;
      }
      case 'quantile_bin': {
        if (numericVal !== null && quantiles) {
          value = findBin(numericVal, quantiles);
        }
        break;
      }
      default:
        break;
    }

    addOutputValue(outputRow, feature.featureName, value);
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows };
};

export const BINNING_METHODS: FeatureMethod[] = ['bucketize', 'quantile_bin'];

export const binningHandlers: Map<FeatureMethod, PreviewFn> = new Map();

for (const method of BINNING_METHODS) {
  binningHandlers.set(method, binningHandler);
}
