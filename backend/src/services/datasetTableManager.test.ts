import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { testStorageDir } = vi.hoisted(() => ({
  testStorageDir: '/tmp/dataset-table-manager-tests'
}));

mkdirSync(testStorageDir, { recursive: true });

vi.mock('../config.js', () => ({
  env: {
    datasetStorageDir: testStorageDir,
    datasetMetadataPath: join(testStorageDir, 'metadata.json')
  }
}));

vi.mock('../db.js', () => ({
  hasDatabaseConfiguration: vi.fn(),
  getDbPool: vi.fn()
}));

vi.mock('./datasetLoader.js', async () => {
  const actual = await vi.importActual<typeof import('./datasetLoader.js')>('./datasetLoader.js');
  return {
    ...actual,
    loadDatasetIntoPostgres: vi.fn()
  };
});

import { hasDatabaseConfiguration } from '../db.js';
import type { DatasetProfile } from '../types/dataset.js';

import { loadDatasetIntoPostgres } from './datasetLoader.js';
import { getDatasetQueryState, rebuildDatasetTableFromSource } from './datasetTableManager.js';

const mockHasDatabaseConfiguration = vi.mocked(hasDatabaseConfiguration);
const mockLoadDatasetIntoPostgres = vi.mocked(loadDatasetIntoPostgres);

describe('datasetTableManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasDatabaseConfiguration.mockReturnValue(true);
    mockLoadDatasetIntoPostgres.mockResolvedValue({
      tableName: 'support_tickets_22222222',
      rowsLoaded: 2
    });
  });

  it('reports loadWarning-backed datasets as non-queryable', async () => {
    const dataset: DatasetProfile = {
      datasetId: '11111111-1111-1111-1111-111111111111',
      filename: 'support_tickets.csv',
      fileType: 'csv',
      size: 10,
      nRows: 2,
      nCols: 2,
      columns: [],
      sample: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        tableName: 'support_tickets',
        loadWarning: 'old load failed'
      }
    };

    await expect(getDatasetQueryState(dataset)).resolves.toEqual({
      tableName: 'support_tickets',
      queryable: false,
      queryError: 'old load failed'
    });
  });

  it('uses the persisted physical table name when determining queryability', async () => {
    const dataset: DatasetProfile = {
      datasetId: '33333333-3333-3333-3333-333333333333',
      filename: 'synthetic_saas_usage_18000_processed_workbook_1.csv',
      fileType: 'csv',
      size: 10,
      nRows: 2,
      nCols: 2,
      columns: [],
      sample: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        tableName: 'synthetic_saas_usage_18000_processed_workbook_1'
      }
    };

    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ exists: true }] })
    };
    const { getDbPool } = await import('../db.js');
    vi.mocked(getDbPool).mockReturnValue(pool as never);

    await expect(getDatasetQueryState(dataset)).resolves.toEqual({
      tableName: 'synthetic_saas_usage_18000_processed_workbook_1',
      queryable: true
    });
  });

  it('rebuilds a broken dataset from source using refreshed inferred column types', async () => {
    const datasetId = '22222222-2222-2222-2222-222222222222';
    const datasetDir = join(testStorageDir, datasetId);
    mkdirSync(datasetDir, { recursive: true });
    writeFileSync(
      join(datasetDir, 'support_tickets.csv'),
      'ticket_id,customer_id,agent_id,created_at\nTK-0000993,NC-10191,A-005,2023-06-25\nTK-0006288,NC-10989,A-016,2025-04-27\n',
      'utf8'
    );

    const dataset: DatasetProfile = {
      datasetId,
      filename: 'support_tickets.csv',
      fileType: 'csv',
      size: 10,
      nRows: 2,
      nCols: 4,
      columns: [
        { name: 'ticket_id', dtype: 'date', nullCount: 0 },
        { name: 'customer_id', dtype: 'date', nullCount: 0 },
        { name: 'agent_id', dtype: 'date', nullCount: 0 },
        { name: 'created_at', dtype: 'date', nullCount: 0 }
      ],
      sample: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        tableName: 'support_tickets',
        loadWarning: 'time zone displacement out of range'
      }
    };

    let updatedDataset: DatasetProfile | undefined;
    const repository = {
      update: vi.fn(async (_datasetId: string, updater: (current: DatasetProfile) => DatasetProfile) => {
        updatedDataset = updater(dataset);
        return updatedDataset;
      })
    } as const;

    const rebuilt = await rebuildDatasetTableFromSource(dataset, repository as never);

    expect(mockLoadDatasetIntoPostgres).toHaveBeenCalledOnce();
    const call = mockLoadDatasetIntoPostgres.mock.calls[0]?.[0];
    expect(call?.tableName).toBe('support_tickets');
    expect(call?.columns.map((column) => [column.name, column.dtype])).toEqual([
      ['ticket_id', 'string'],
      ['customer_id', 'string'],
      ['agent_id', 'string'],
      ['created_at', 'date']
    ]);

    expect(rebuilt.columns.map((column) => [column.name, column.dtype])).toEqual([
      ['ticket_id', 'string'],
      ['customer_id', 'string'],
      ['agent_id', 'string'],
      ['created_at', 'date']
    ]);
    expect(rebuilt.metadata?.tableName).toBe('support_tickets');
    expect(rebuilt.metadata?.rowsLoaded).toBe(2);
    expect(rebuilt.metadata?.loadWarning).toBeUndefined();
    expect(updatedDataset?.sample).toEqual([
      {
        ticket_id: 'TK-0000993',
        customer_id: 'NC-10191',
        agent_id: 'A-005',
        created_at: '2023-06-25'
      },
      {
        ticket_id: 'TK-0006288',
        customer_id: 'NC-10989',
        agent_id: 'A-016',
        created_at: '2025-04-27'
      }
    ]);
  });
});
