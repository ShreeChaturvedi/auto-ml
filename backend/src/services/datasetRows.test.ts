import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../config.js';
import type { DatasetProfile } from '../types/dataset.js';

import { resolveDatasetTableName } from './datasetLoader.js';
import { getDatasetRowsPage } from './datasetRows.js';

const mockQuery = vi.fn();
const mockParseDatasetRows = vi.fn();
const mockSanitizeTableName = vi.fn((filename: string, datasetId: string) => `${filename}_${datasetId}`);
const mockHasDatabaseConfiguration = vi.fn();

vi.mock('../db.js', () => ({
  getDbPool: () => ({ query: mockQuery }),
  hasDatabaseConfiguration: () => mockHasDatabaseConfiguration()
}));

vi.mock('./datasetLoader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./datasetLoader.js')>();
  return {
    ...actual,
    parseDatasetRows: (...args: unknown[]) => mockParseDatasetRows(...args),
    sanitizeTableName: (filename: string, datasetId: string) => mockSanitizeTableName(filename, datasetId)
  };
});

function createDataset(overrides?: Partial<DatasetProfile>): DatasetProfile {
  return {
    datasetId: 'dataset-1',
    filename: 'test.csv',
    fileType: 'csv',
    size: 128,
    nRows: 5,
    nCols: 2,
    columns: [
      { name: 'id', dtype: 'integer', nullCount: 0 },
      { name: 'name', dtype: 'string', nullCount: 0 }
    ],
    sample: [{ id: 1, name: 'A' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function storeDatasetFile(dataset: DatasetProfile, contents: string) {
  const datasetDir = join(env.datasetStorageDir, dataset.datasetId);
  mkdirSync(datasetDir, { recursive: true });
  writeFileSync(join(datasetDir, dataset.filename), contents, 'utf8');
}

describe('datasetRows', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockParseDatasetRows.mockReset();
    mockSanitizeTableName.mockClear();
    mockHasDatabaseConfiguration.mockReset();
    mockHasDatabaseConfiguration.mockReturnValue(false);
  });

  it('uses the metadata table name when present', () => {
    const dataset = createDataset({ metadata: { tableName: 'custom_table' } });
    expect(resolveDatasetTableName(dataset)).toBe('custom_table');
    expect(mockSanitizeTableName).not.toHaveBeenCalled();
  });

  it('reads dataset rows from Postgres when configured', async () => {
    mockHasDatabaseConfiguration.mockReturnValue(true);
    mockQuery.mockResolvedValue({
      rows: [{ id: 2, name: 'B' }, { id: 3, name: 'C' }]
    });

    const dataset = createDataset({ metadata: { tableName: 'dataset_rows' } });
    const page = await getDatasetRowsPage(dataset, { offset: 1, limit: 2 });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM "dataset_rows" ORDER BY ctid OFFSET $1 LIMIT $2',
      [1, 2]
    );
    expect(page.rows).toEqual([{ id: 2, name: 'B' }, { id: 3, name: 'C' }]);
    expect(page.rowCount).toBe(5);
  });

  it('falls back to file storage when the Postgres read fails', async () => {
    mockHasDatabaseConfiguration.mockReturnValue(true);
    mockQuery.mockRejectedValue(new Error('relation does not exist'));
    mockParseDatasetRows.mockResolvedValue([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
      { id: 4, name: 'D' }
    ]);

    const dataset = createDataset();
    storeDatasetFile(dataset, 'id,name\n1,A\n2,B\n3,C\n4,D');

    const page = await getDatasetRowsPage(dataset, { offset: 1, limit: 2 });

    expect(mockParseDatasetRows).toHaveBeenCalled();
    expect(page.rows).toEqual([{ id: 2, name: 'B' }, { id: 3, name: 'C' }]);
  });

  it('returns an empty page when the requested offset is past the dataset length', async () => {
    const dataset = createDataset({ nRows: 3 });
    const page = await getDatasetRowsPage(dataset, { offset: 5, limit: 2 });

    expect(page.rows).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockParseDatasetRows).not.toHaveBeenCalled();
  });
});
