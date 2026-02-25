import { describe, expect, it } from 'vitest';

import { profileDatasetRows } from './datasetProfiler.js';

describe('datasetProfiler', () => {
  it('infers integer when values are integer-like and null-like tokens are present', () => {
    const rows = [
      { pos: '1' },
      { pos: '2.0' },
      { pos: 'N/A' },
      { pos: '1,000' },
      { pos: '--' },
      { pos: '' }
    ];

    const result = profileDatasetRows(rows);
    const column = result.columns.find((item) => item.name === 'pos');

    expect(column).toBeDefined();
    expect(column?.dtype).toBe('integer');
    expect(column?.nullCount).toBe(3);
  });

  it('infers float when any numeric value has a fractional part', () => {
    const rows = [{ score: '1' }, { score: '2.5' }, { score: '3.0' }, { score: '4' }];

    const result = profileDatasetRows(rows);
    const column = result.columns.find((item) => item.name === 'score');

    expect(column).toBeDefined();
    expect(column?.dtype).toBe('float');
  });
});
