/**
 * Preview handlers for datetime / temporal methods:
 * extract_year, extract_month, extract_day, extract_weekday, extract_hour,
 * time_since, cyclical_encode.
 */

import type { FeatureMethod } from '@/types/feature';
import type { PreviewContext, PreviewFn, Row } from './types';
import { coerceDate } from './helpers';

/** All single-output date extraction methods share this handler. */
const dateExtractHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, params, sourceColumn, addOutputValue, getSource } = ctx;

  const outputColumns = [feature.featureName];
  const outputRows: Row[] = [];

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const date = coerceDate(getSource(row));
    let value: unknown = null;

    if (date) {
      switch (feature.method) {
        case 'extract_year':
          value = date.getFullYear();
          break;
        case 'extract_month':
          value = date.getMonth() + 1;
          break;
        case 'extract_day':
          value = date.getDate();
          break;
        case 'extract_weekday':
          value = date.getDay();
          break;
        case 'extract_hour':
          value = date.getHours();
          break;
        case 'time_since': {
          const unit = String(params.unit ?? 'days');
          const diffMs = Date.now() - date.getTime();
          const divisor =
            unit === 'hours'
              ? 1000 * 60 * 60
              : unit === 'weeks'
                ? 1000 * 60 * 60 * 24 * 7
                : unit === 'months'
                  ? 1000 * 60 * 60 * 24 * 30
                  : 1000 * 60 * 60 * 24;
          value = diffMs / divisor;
          break;
        }
        default:
          break;
      }
    }

    addOutputValue(outputRow, feature.featureName, value);
    outputRows.push(outputRow);
  }

  return { columns: outputColumns, rows: outputRows };
};

/** cyclical_encode produces two columns (sin + cos). */
const cyclicalHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, params, sourceColumn, addOutputValue, getSource } = ctx;
  const periodKey = String(params.period ?? 'month');
  const periodMap: Record<string, number> = {
    hour: 24,
    weekday: 7,
    month: 12,
    day_of_year: 365,
  };
  const attrMap: Record<string, (d: Date) => number> = {
    hour: (d) => d.getHours(),
    weekday: (d) => d.getDay(),
    month: (d) => d.getMonth() + 1,
    day_of_year: (d) => {
      const start = new Date(d.getFullYear(), 0, 0);
      const diff = d.getTime() - start.getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    },
  };
  const period = periodMap[periodKey] ?? 12;
  const sinCol = `${feature.featureName}_sin`;
  const cosCol = `${feature.featureName}_cos`;
  const outputRows: Row[] = [];

  for (const row of sample) {
    const date = coerceDate(getSource(row));
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    if (date) {
      const base = attrMap[periodKey] ? attrMap[periodKey](date) : date.getMonth() + 1;
      addOutputValue(outputRow, sinCol, Math.sin((2 * Math.PI * base) / period));
      addOutputValue(outputRow, cosCol, Math.cos((2 * Math.PI * base) / period));
    }
    outputRows.push(outputRow);
  }

  return { columns: [sinCol, cosCol], rows: outputRows };
};

export const temporalHandlers: Map<FeatureMethod, PreviewFn> = new Map([
  ['extract_year', dateExtractHandler],
  ['extract_month', dateExtractHandler],
  ['extract_day', dateExtractHandler],
  ['extract_weekday', dateExtractHandler],
  ['extract_hour', dateExtractHandler],
  ['time_since', dateExtractHandler],
  ['cyclical_encode', cyclicalHandler],
]);
