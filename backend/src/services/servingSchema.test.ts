import { describe, expect, it } from 'vitest';

import type { DatasetProfile } from '../types/dataset.js';

import { deriveServingSchema, hasCompleteServingSchema } from './servingSchema.js';

function makeDataset(overrides: Partial<DatasetProfile> = {}): DatasetProfile {
  return {
    datasetId: 'dataset-1',
    projectId: 'project-1',
    filename: 'training.csv',
    fileType: 'csv',
    size: 123,
    nRows: 2,
    nCols: 3,
    columns: [
      { name: 'age', dtype: 'float', nullCount: 0 },
      { name: 'segment', dtype: 'string', nullCount: 0 },
      { name: 'target', dtype: 'integer', nullCount: 0 },
    ],
    sample: [
      { age: 41, target: 1 },
      { segment: 'north', target: 0 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('servingSchema', () => {
  it('uses preferred feature columns and fills missing sample values with dtype-safe defaults', () => {
    const result = deriveServingSchema(makeDataset(), 'target', ['age', 'segment']);

    expect(result).toEqual({
      ok: true,
      featureColumns: ['age', 'segment'],
      featureTypes: { age: 'float', segment: 'str' },
      sampleRequest: { age: 41, segment: '' },
    });
  });

  it('falls back to dataset columns minus the target when preferred feature columns are absent', () => {
    const result = deriveServingSchema(makeDataset(), 'target');

    expect(result).toEqual({
      ok: true,
      featureColumns: ['age', 'segment'],
      featureTypes: { age: 'float', segment: 'str' },
      sampleRequest: { age: 41, segment: '' },
    });
  });

  it('returns a structured failure when no usable feature columns remain', () => {
    const result = deriveServingSchema(
      makeDataset({
        columns: [{ name: 'target', dtype: 'integer', nullCount: 0 }],
        sample: [{ target: 1 }],
      }),
      'target',
    );

    expect(result).toEqual({
      ok: false,
      error: 'Unable to derive serving schema: dataset "dataset-1" has no usable feature columns after excluding target column "target".',
    });
  });

  it('recognizes complete serving schema payloads', () => {
    expect(hasCompleteServingSchema({
      featureColumns: ['age'],
      featureTypes: { age: 'float' },
      sampleRequest: { age: 41 },
    })).toBe(true);

    expect(hasCompleteServingSchema({
      featureColumns: ['age'],
      featureTypes: {},
      sampleRequest: { age: 41 },
    })).toBe(false);
  });
});
