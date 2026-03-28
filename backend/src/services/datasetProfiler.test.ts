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

  it('does not misclassify identifier-like values as dates', () => {
    const rows = [
      { ticket_id: 'TK-0000993', customer_id: 'NC-10191', agent_id: 'A-005', created_at: '2023-06-25' },
      { ticket_id: 'TK-0006288', customer_id: 'NC-10989', agent_id: 'A-016', created_at: '2025-04-27' }
    ];

    const result = profileDatasetRows(rows);

    expect(result.columns.find((item) => item.name === 'ticket_id')?.dtype).toBe('string');
    expect(result.columns.find((item) => item.name === 'customer_id')?.dtype).toBe('string');
    expect(result.columns.find((item) => item.name === 'agent_id')?.dtype).toBe('string');
    expect(result.columns.find((item) => item.name === 'created_at')?.dtype).toBe('date');
  });
});
