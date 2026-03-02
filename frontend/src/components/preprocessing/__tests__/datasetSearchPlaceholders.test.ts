import { describe, expect, it } from 'vitest';

import { buildDatasetSearchPlaceholders } from '../datasetSearchPlaceholders';

describe('buildDatasetSearchPlaceholders', () => {
  it('returns unique table names from project datasets', () => {
    const placeholders = buildDatasetSearchPlaceholders([
      {
        datasetId: 'dataset-1',
        name: 'customers_table',
        filename: 'customers.csv',
        sizeBytes: 10
      },
      {
        datasetId: 'dataset-2',
        name: 'orders_table',
        filename: 'orders.csv',
        sizeBytes: 20
      },
      {
        datasetId: 'dataset-3',
        name: 'customers_table',
        filename: 'customers.csv',
        sizeBytes: 30
      }
    ]);

    expect(placeholders).toEqual([
      'customers_table',
      'orders_table',
    ]);
  });

  it('returns fallback placeholders when there are no datasets', () => {
    expect(buildDatasetSearchPlaceholders([])).toEqual([
      'customers',
      'transactions',
      'support_tickets'
    ]);
  });
});
