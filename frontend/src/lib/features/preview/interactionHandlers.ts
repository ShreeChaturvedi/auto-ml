/**
 * Preview handlers for interaction/combination methods:
 * ratio, difference, product, polynomial.
 */

import type { FeatureMethod } from '@/types/feature';
import type { PreviewContext, PreviewFn, Row } from './types';
import { coerceNumber } from './helpers';

/** ratio, difference, and product produce a single output column. */
const pairwiseHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, sourceColumn, addOutputValue, getSource, getSecondary } = ctx;

  const outputColumns = [feature.featureName];
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const numericVal = coerceNumber(getSource(row));
    const secondaryNum = coerceNumber(getSecondary(row));
    let value: unknown = null;

    switch (feature.method) {
      case 'ratio':
        if (numericVal !== null && secondaryNum !== null && secondaryNum !== 0) {
          value = numericVal / secondaryNum;
        }
        break;
      case 'difference':
        if (numericVal !== null && secondaryNum !== null) {
          value = numericVal - secondaryNum;
        }
        break;
      case 'product':
        if (numericVal !== null && secondaryNum !== null) {
          value = numericVal * secondaryNum;
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

/** polynomial produces multiple power columns. */
const polynomialHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, sourceColumn, addOutputValue, getSource } = ctx;
  const degree = Math.max(2, Number(ctx.params.degree ?? 2));
  const outputColumns: string[] = [];
  for (let power = 2; power <= degree; power += 1) {
    outputColumns.push(`${feature.featureName}_pow${power}`);
  }
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const numericVal = coerceNumber(getSource(row));
    outputColumns.forEach((col, idx) => {
      const power = idx + 2;
      addOutputValue(outputRow, col, numericVal !== null ? numericVal ** power : null);
    });
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows };
};

export const interactionHandlers: Map<FeatureMethod, PreviewFn> = new Map([
  ['ratio', pairwiseHandler],
  ['difference', pairwiseHandler],
  ['product', pairwiseHandler],
  ['polynomial', polynomialHandler],
]);
