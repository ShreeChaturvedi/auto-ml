/**
 * Preview handlers for numeric transform methods:
 * log, log1p, sqrt, square, reciprocal, missing_indicator, box_cox, yeo_johnson.
 */

import type { FeatureMethod } from '@/types/feature';
import type { PreviewContext, PreviewFn, Row } from './types';
import { coerceNumber, isMissing } from './helpers';

/** Single-row value computation for numeric transforms. */
function computeNumericValue(
  method: FeatureMethod,
  numericVal: number | null,
  params: Record<string, unknown>
): unknown {
  switch (method) {
    case 'log_transform': {
      const offset = Number(params.offset ?? 1);
      return numericVal !== null ? Math.log(numericVal + offset) : null;
    }
    case 'log1p_transform':
      return numericVal !== null ? Math.log1p(numericVal) : null;
    case 'sqrt_transform':
      return numericVal !== null && numericVal >= 0 ? Math.sqrt(numericVal) : null;
    case 'square_transform':
      return numericVal !== null ? numericVal ** 2 : null;
    case 'reciprocal_transform':
      return numericVal !== null && numericVal !== 0 ? 1 / numericVal : null;
    case 'missing_indicator':
      // handled separately — should not reach here
      return null;
    default:
      return null;
  }
}

const numericHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, params, sourceColumn, addOutputValue, getSource } = ctx;

  const outputColumns = [feature.featureName];
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const sourceVal = getSource(row);
    const numericVal = coerceNumber(sourceVal);
    let value: unknown = null;

    if (feature.method === 'missing_indicator') {
      value = isMissing(sourceVal) ? 1 : 0;
    } else {
      value = computeNumericValue(feature.method, numericVal, params);
    }

    addOutputValue(outputRow, feature.featureName, value);
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows };
};

const runtimeOnlyHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, sourceColumn, getSource } = ctx;
  const outputRows = sample.map((row) => ({
    [sourceColumn]: getSource(row),
    [feature.featureName]: null,
  }));
  return {
    columns: [feature.featureName],
    rows: outputRows,
    note: 'Preview requires Python runtime to estimate the transform.',
  };
};

export const NUMERIC_METHODS: FeatureMethod[] = [
  'log_transform',
  'log1p_transform',
  'sqrt_transform',
  'square_transform',
  'reciprocal_transform',
  'missing_indicator',
];

export const numericHandlers: Map<FeatureMethod, PreviewFn> = new Map();

for (const method of NUMERIC_METHODS) {
  numericHandlers.set(method, numericHandler);
}

// Runtime-only transforms (require Python)
numericHandlers.set('box_cox', runtimeOnlyHandler);
numericHandlers.set('yeo_johnson', runtimeOnlyHandler);
