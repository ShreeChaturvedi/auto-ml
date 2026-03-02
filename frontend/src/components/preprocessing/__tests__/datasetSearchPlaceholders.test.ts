import { describe, expect, it } from 'vitest';

import { buildDatasetSearchPlaceholders } from '../datasetSearchPlaceholders';

describe('buildDatasetSearchPlaceholders', () => {
  it('returns unique filename, id, and table name values from project datasets', () => {
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
      'customers.csv',
      'dataset-1',
      'customers_table',
      'orders.csv',
      'dataset-2',
      'orders_table',
      'dataset-3'
    ]);
  });

  it('returns fallback placeholders when there are no datasets', () => {
    expect(buildDatasetSearchPlaceholders([])).toEqual([
      'customer_churn.csv',
      'dataset_abc123',
      'transactions_2025'
    ]);
  });
});
