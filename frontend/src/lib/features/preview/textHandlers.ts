/**
 * Preview handlers for text feature methods:
 * text_length, word_count, contains_pattern.
 */

import type { FeatureMethod } from '@/types/feature';
import type { PreviewContext, PreviewFn, Row } from './types';

const textHandler: PreviewFn = (ctx: PreviewContext) => {
  const { feature, sample, params, sourceColumn, addOutputValue, getSource } = ctx;

  const outputColumns = [feature.featureName];
  const outputRows: Row[] = [];
  let note: string | undefined;

  for (const row of sample) {
    const outputRow: Row = { [sourceColumn]: getSource(row) };
    const sourceVal = getSource(row);
    let value: unknown = null;

    switch (feature.method) {
      case 'text_length':
        value = typeof sourceVal === 'string' ? sourceVal.length : 0;
        break;
      case 'word_count':
        value =
          typeof sourceVal === 'string'
            ? sourceVal.trim().split(/\s+/).filter(Boolean).length
            : 0;
        break;
      case 'contains_pattern': {
        const pattern = String(params.pattern ?? '');
        if (!pattern) {
          note = 'Add a pattern to preview matches.';
          break;
        }
        const caseSensitive = params.case_sensitive === true;
        let matched: boolean;
        if (typeof sourceVal === 'string') {
          matched = caseSensitive
            ? sourceVal.includes(pattern)
            : sourceVal.toLowerCase().includes(pattern.toLowerCase());
        } else {
          matched = false;
        }
        value = matched ? 1 : 0;
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

export const textHandlers: Map<FeatureMethod, PreviewFn> = new Map([
  ['text_length', textHandler],
  ['word_count', textHandler],
  ['contains_pattern', textHandler],
]);
