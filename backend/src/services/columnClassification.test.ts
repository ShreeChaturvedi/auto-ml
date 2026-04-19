import { describe, expect, it } from 'vitest';

import type { DatasetProfileColumn } from '../types/dataset.js';

import {
  findLikelyIdentifierColumns,
  isLikelyIdentifierColumn,
} from './columnClassification.js';

function col(overrides: Partial<DatasetProfileColumn>): DatasetProfileColumn {
  return {
    name: 'x',
    dtype: 'string',
    nullCount: 0,
    ...overrides,
  };
}

describe('isLikelyIdentifierColumn', () => {
  it('flags columns whose name ends in _id', () => {
    expect(isLikelyIdentifierColumn(col({ name: 'customer_id' }), 150)).toBe(true);
    expect(isLikelyIdentifierColumn(col({ name: 'user_id' }), 1000)).toBe(true);
    expect(isLikelyIdentifierColumn(col({ name: 'transaction_id' }), 100)).toBe(true);
  });

  it('flags bare "id" column', () => {
    expect(isLikelyIdentifierColumn(col({ name: 'id' }), 100)).toBe(true);
  });

  it('flags uuid / guid / email / ssn / pk patterns', () => {
    expect(isLikelyIdentifierColumn(col({ name: 'uuid' }), 100)).toBe(true);
    expect(isLikelyIdentifierColumn(col({ name: 'record_uuid' }), 100)).toBe(true);
    expect(isLikelyIdentifierColumn(col({ name: 'email' }), 100)).toBe(true);
    expect(isLikelyIdentifierColumn(col({ name: 'user_email' }), 100)).toBe(true);
    expect(isLikelyIdentifierColumn(col({ name: 'ssn' }), 100)).toBe(true);
  });

  it('flags columns with cardinality > max(20, 0.3 * nRows) regardless of name', () => {
    // 150 rows → threshold = max(20, 45) = 45. 120 uniques exceeds.
    expect(
      isLikelyIdentifierColumn(col({ name: 'neighborhood', uniqueCount: 120 }), 150)
    ).toBe(true);
    // Under threshold.
    expect(
      isLikelyIdentifierColumn(col({ name: 'plan_type', uniqueCount: 5 }), 150)
    ).toBe(false);
    // 50 rows → threshold = max(20, 15) = 20. 22 unique over 20.
    expect(
      isLikelyIdentifierColumn(col({ name: 'zone', uniqueCount: 22 }), 50)
    ).toBe(true);
  });

  it('flags fully-unique string / integer columns (primary-key-like)', () => {
    expect(
      isLikelyIdentifierColumn(col({ name: 'row_key', dtype: 'string', uniqueCount: 100 }), 100)
    ).toBe(true);
    expect(
      isLikelyIdentifierColumn(col({ name: 'row_number', dtype: 'integer', uniqueCount: 50 }), 50)
    ).toBe(true);
  });

  it('does NOT flag well-behaved feature columns', () => {
    expect(
      isLikelyIdentifierColumn(col({ name: 'age', dtype: 'integer', uniqueCount: 40 }), 150)
    ).toBe(false);
    expect(
      isLikelyIdentifierColumn(col({ name: 'monthly_spend', dtype: 'float', uniqueCount: 120 }), 1000)
    ).toBe(false);
    expect(
      isLikelyIdentifierColumn(col({ name: 'is_churned', dtype: 'boolean', uniqueCount: 2 }), 150)
    ).toBe(false);
  });

  it('returns false gracefully when uniqueCount is missing and name is benign', () => {
    expect(isLikelyIdentifierColumn(col({ name: 'monthly_spend' }), 100)).toBe(false);
  });

  it('returns false for empty name', () => {
    expect(isLikelyIdentifierColumn(col({ name: '' }), 100)).toBe(false);
  });
});

describe('findLikelyIdentifierColumns', () => {
  it('filters a column list to the suspects', () => {
    const columns: DatasetProfileColumn[] = [
      col({ name: 'customer_id', uniqueCount: 150 }),
      col({ name: 'age', uniqueCount: 40, dtype: 'integer' }),
      col({ name: 'plan_type', uniqueCount: 5 }),
      col({ name: 'email' }),
    ];
    const flagged = findLikelyIdentifierColumns(columns, 150);
    expect(flagged.map((c) => c.name)).toEqual(['customer_id', 'email']);
  });
});
