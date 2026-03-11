/**
 * Preview handlers for encoding methods:
 * one_hot_encode, label_encode, target_encode, frequency_encode, binary_encode.
 */

import type { FeatureMethod } from '@/types/feature';
import { buildFrequencies } from '@/lib/stats';
import type { PreviewContext, PreviewFn, Row } from './types';
import { buildTargetStats } from './helpers';

/** label_encode and frequency_encode produce a single output column. */
const singleEncodingHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, params, sourceColumn, addOutputValue, getSource } = ctx;

  const frequencies = buildFrequencies(sample, sourceColumn);
  const targetColumn = params.targetColumn as string | undefined;
  const targetStats = targetColumn
    ? buildTargetStats(sample, sourceColumn, targetColumn)
    : null;

  const outputColumns = [feature.featureName];
  const outputRows: Row[] = [];
  let note: string | undefined;

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const sourceVal = getSource(row);
    let value: unknown = null;

    switch (feature.method) {
      case 'label_encode':
        value = ctx.categoryMap.has(String(sourceVal))
          ? ctx.categoryMap.get(String(sourceVal))
          : null;
        break;
      case 'frequency_encode': {
        const normalize = params.normalize !== false;
        const entry = frequencies.get(String(sourceVal));
        value = entry ? (normalize ? entry.count / entry.total : entry.count) : null;
        break;
      }
      case 'target_encode': {
        if (!targetColumn) {
          note = 'Target encoding requires a target column.';
          break;
        }
        if (targetStats) {
          value = targetStats.get(String(sourceVal)) ?? null;
        }
        break;
      }
      default:
        break;
    }

    addOutputValue(outputRow, feature.featureName, value);
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows, note };
};

/** one_hot_encode produces multiple binary indicator columns. */
const oneHotHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, sourceColumn, addOutputValue, getSource, categories } = ctx;
  const maxCategories = 6;
  const limited = categories.slice(0, maxCategories);
  const note =
    categories.length > maxCategories
      ? `Preview shows top ${maxCategories} categories only.`
      : undefined;
  const columnsList = limited.map((value) => `${feature.featureName}_${value}`);
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const value = String(getSource(row));
    columnsList.forEach((col, idx) => {
      addOutputValue(outputRow, col, value === String(limited[idx]) ? 1 : 0);
    });
    outputRows.push(outputRow);
  }

  return { columns: columnsList, rows: outputRows, note };
};

/** binary_encode produces bit-decomposed columns. */
const binaryHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, sourceColumn, addOutputValue, getSource, categories, categoryMap } =
    ctx;
  const categoriesList = categories.slice(0, 32);
  const maxValue = Math.max(categoriesList.length - 1, 1);
  const bits = Math.max(1, Math.ceil(Math.log2(maxValue + 1)));
  const outputColumns: string[] = [];
  for (let i = 0; i < bits; i += 1) {
    outputColumns.push(`${feature.featureName}_bin${i}`);
  }
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const value = categoryMap.get(String(getSource(row))) ?? 0;
    for (let i = 0; i < bits; i += 1) {
      addOutputValue(outputRow, `${feature.featureName}_bin${i}`, (value >> i) & 1);
    }
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows };
};

export const encodingHandlers: Map<FeatureMethod, PreviewFn> = new Map([
  ['label_encode', singleEncodingHandler],
  ['frequency_encode', singleEncodingHandler],
  ['target_encode', singleEncodingHandler],
  ['one_hot_encode', oneHotHandler],
  ['binary_encode', binaryHandler],
]);
