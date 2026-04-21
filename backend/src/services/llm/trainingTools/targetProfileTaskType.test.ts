import { describe, expect, it } from 'vitest';

import type { DatasetProfileColumn } from '../../../types/dataset.js';

import { formatTargetProfileForPrompt, inferTaskTypeFromTargetProfile } from './registrationTools.js';

function col(overrides: Partial<DatasetProfileColumn>): DatasetProfileColumn {
  return {
    name: 'target',
    dtype: 'integer',
    nullCount: 0,
    ...overrides,
  };
}

describe('inferTaskTypeFromTargetProfile', () => {
  it('returns ambiguous when column is missing', () => {
    expect(inferTaskTypeFromTargetProfile(null)).toEqual({
      taskType: 'ambiguous',
      reason: expect.stringContaining('unavailable'),
    });
  });

  it('classifies string/categorical as classification', () => {
    expect(inferTaskTypeFromTargetProfile(col({ dtype: 'string', uniqueCount: 3 }))).toEqual({
      taskType: 'classification',
      reason: expect.stringContaining('string/categorical'),
    });
  });

  it('classifies boolean as classification', () => {
    expect(inferTaskTypeFromTargetProfile(col({ dtype: 'boolean', uniqueCount: 2 }))).toEqual({
      taskType: 'classification',
      reason: expect.stringContaining('boolean'),
    });
  });

  it('classifies binary 0/1 integer as classification', () => {
    expect(inferTaskTypeFromTargetProfile(col({
      dtype: 'integer',
      uniqueCount: 2,
      topValues: [
        { value: '0', count: 500, percentage: 50 },
        { value: '1', count: 500, percentage: 50 },
      ],
    }))).toEqual({ taskType: 'classification', reason: expect.stringContaining('binary 0/1') });
  });

  it('classifies continuous integer target as regression (user CatBoost case)', () => {
    expect(inferTaskTypeFromTargetProfile(col({
      dtype: 'integer',
      uniqueCount: 18000,
      min: 0,
      max: 45218,
    }))).toEqual({
      taskType: 'regression',
      reason: expect.stringContaining('continuous integer'),
    });
  });

  it('classifies continuous float target as regression', () => {
    expect(inferTaskTypeFromTargetProfile(col({
      dtype: 'float',
      uniqueCount: 9821,
      min: 0.01,
      max: 99.8,
    }))).toEqual({
      taskType: 'regression',
      reason: expect.stringContaining('continuous float'),
    });
  });

  it('returns ambiguous for low-cardinality integer (ordinal vs class IDs)', () => {
    expect(inferTaskTypeFromTargetProfile(col({
      dtype: 'integer',
      uniqueCount: 5,
      min: 1,
      max: 5,
    }))).toEqual({
      taskType: 'ambiguous',
      reason: expect.stringContaining('low-cardinality integer'),
    });
  });

  it('classifies date dtype as regression (time-series)', () => {
    expect(inferTaskTypeFromTargetProfile(col({ dtype: 'date' }))).toEqual({
      taskType: 'regression',
      reason: expect.stringContaining('date dtype'),
    });
  });

  it('classifies float targets (default) as regression when few unique shown', () => {
    expect(inferTaskTypeFromTargetProfile(col({
      dtype: 'float',
      uniqueCount: 15,
    }))).toEqual({
      taskType: 'regression',
      reason: expect.stringContaining('float target'),
    });
  });
});

describe('formatTargetProfileForPrompt', () => {
  it('returns null when column is missing', () => {
    expect(formatTargetProfileForPrompt(null)).toBeNull();
  });

  it('produces a human-readable profile line with inferred task type', () => {
    const line = formatTargetProfileForPrompt(col({
      name: 'usage_count',
      dtype: 'integer',
      uniqueCount: 18000,
      min: 0,
      max: 45218,
    }));
    expect(line).toContain('usage_count (integer)');
    expect(line).toContain('18,000 unique values');
    expect(line).toContain('range [0, 45218]');
    expect(line).toContain('inferred task type: regression');
  });
});
