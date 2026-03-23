import { describe, expect, it } from 'vitest';

import { createNlFilterNormalizer, NlFilterResponseSchema } from './schema.js';
import type { NlFilterContext } from './service.js';

const baseCtx: NlFilterContext = {
  metricFields: ['accuracy', 'f1', 'precision'],
  algorithms: ['RandomForestClassifier', 'LogisticRegression'],
  taskTypes: ['classification'],
  metricRanges: { accuracy: { min: 0.72, max: 0.95 }, f1: { min: 0.65, max: 0.88 } },
  metricStats: {
    accuracy: { min: 0.72, max: 0.95, p25: 0.78, median: 0.85, p75: 0.91 },
    f1: { min: 0.65, max: 0.88, p25: 0.70, median: 0.77, p75: 0.84 },
  },
};

describe('NlFilterResponseSchema', () => {
  it('validates a well-formed response', () => {
    const result = NlFilterResponseSchema.safeParse({
      predicates: [{ field: 'accuracy', operator: 'gt', value: 0.9 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid operator', () => {
    const result = NlFilterResponseSchema.safeParse({
      predicates: [{ field: 'accuracy', operator: 'greater', value: 0.9 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('createNlFilterNormalizer', () => {
  const normalize = createNlFilterNormalizer(baseCtx);

  it('strips metrics. prefix from field names', () => {
    const result = normalize({
      predicates: [{ field: 'metrics.accuracy', operator: 'gt', value: 0.9 }],
    }) as { predicates: Array<{ field: string }> };

    expect(result.predicates[0].field).toBe('accuracy');
  });

  it('fuzzy-matches algorithm names to actual project values', () => {
    const result = normalize({
      predicates: [{ field: 'algorithm', operator: 'contains', value: 'random forest' }],
    }) as { predicates: Array<{ value: string }> };

    expect(result.predicates[0].value).toBe('RandomForestClassifier');
  });

  it('normalizes percentage string to decimal', () => {
    const result = normalize({
      predicates: [{ field: 'accuracy', operator: 'gt', value: '90%' }],
    }) as { predicates: Array<{ value: number }> };

    expect(result.predicates[0].value).toBe(0.9);
  });

  it('normalizes bare number > 1 to decimal when metric range is 0-1', () => {
    const result = normalize({
      predicates: [{ field: 'accuracy', operator: 'gt', value: 90 }],
    }) as { predicates: Array<{ value: number }> };

    expect(result.predicates[0].value).toBe(0.9);
  });

  it('lowercases field names not in alias map', () => {
    const result = normalize({
      predicates: [{ field: 'Accuracy', operator: 'gt', value: 0.9 }],
    }) as { predicates: Array<{ field: string }> };

    expect(result.predicates[0].field).toBe('accuracy');
  });

  it('does not mutate the input object', () => {
    const input = { predicates: [{ field: 'accuracy', operator: 'gt', value: 0.9 }] };
    const result = normalize(input);
    expect(result).not.toBe(input);
  });

  it('handles malformed input without crashing', () => {
    expect(normalize(null)).toBe(null);
    expect(normalize({})).toEqual({});
    expect(normalize({ predicates: 'not-an-array' })).toEqual({ predicates: 'not-an-array' });
  });
});
