import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { DatasetRepository } from '../repositories/datasetRepository.js';
import type { DatasetProfile, DatasetProfileInput } from '../types/dataset.js';

import {
  buildProjectSqlRegistry,
  ensureProjectDatasetSqlNames,
  rewriteProjectSqlToPhysical
} from './datasetSqlNames.js';

class InMemoryDatasetRepository implements DatasetRepository {
  constructor(private readonly datasets: DatasetProfile[]) {}

  async list(): Promise<DatasetProfile[]> {
    return [...this.datasets];
  }

  async listByProject(projectId: string): Promise<DatasetProfile[]> {
    return this.datasets.filter((dataset) => dataset.projectId === projectId);
  }

  async get(datasetId: string): Promise<DatasetProfile | undefined> {
    return this.datasets.find((dataset) => dataset.datasetId === datasetId);
  }

  async getById(datasetId: string): Promise<DatasetProfile | undefined> {
    return this.get(datasetId);
  }

  async create(_input: DatasetProfileInput): Promise<DatasetProfile> {
    void _input;
    throw new Error('Not implemented in test repository');
  }

  async update(
    datasetId: string,
    updater: (current: DatasetProfile) => DatasetProfile
  ): Promise<DatasetProfile | undefined> {
    const index = this.datasets.findIndex((dataset) => dataset.datasetId === datasetId);
    if (index === -1) {
      return undefined;
    }

    const updated = updater(this.datasets[index]);
    this.datasets[index] = updated;
    return updated;
  }

  async delete(_datasetId: string): Promise<boolean> {
    void _datasetId;
    throw new Error('Not implemented in test repository');
  }
}

function createDataset(overrides: Partial<DatasetProfile>): DatasetProfile {
  const now = new Date().toISOString();
  return {
    datasetId: overrides.datasetId ?? randomUUID(),
    projectId: overrides.projectId ?? 'project-1',
    filename: overrides.filename ?? 'dataset.csv',
    fileType: overrides.fileType ?? 'csv',
    size: overrides.size ?? 128,
    nRows: overrides.nRows ?? 10,
    nCols: overrides.nCols ?? 2,
    columns: overrides.columns ?? [
      { name: 'id', dtype: 'integer', nullCount: 0 },
      { name: 'value', dtype: 'float', nullCount: 0 }
    ],
    sample: overrides.sample ?? [{ id: 1, value: 10 }],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    metadata: overrides.metadata
  };
}

describe('datasetSqlNames', () => {
  it('backfills unique logical SQL names per project', async () => {
    const repository = new InMemoryDatasetRepository([
      createDataset({
        datasetId: '11111111-1111-1111-1111-111111111111',
        filename: 'customers.csv',
        createdAt: '2026-03-01T00:00:00.000Z',
        metadata: { tableName: 'customers_11111111' }
      }),
      createDataset({
        datasetId: '22222222-2222-2222-2222-222222222222',
        filename: 'customers.csv',
        createdAt: '2026-03-02T00:00:00.000Z',
        metadata: { tableName: 'customers_22222222' }
      })
    ]);

    const datasets = await ensureProjectDatasetSqlNames('project-1', repository);

    expect(datasets[0].metadata?.sqlName).toBe('customers');
    expect(datasets[1].metadata?.sqlName).toBe('customers_2');
  });

  it('derives missing logical SQL names without mutating the repository', async () => {
    const datasets = [createDataset({
      datasetId: '11111111-1111-1111-1111-111111111111',
      filename: 'customers.csv',
      projectId: 'project-1',
      createdAt: '2026-03-01T00:00:00.000Z',
      metadata: { tableName: 'customers_11111111' }
    })];
    const update = vi.fn(async () => undefined);
    const repository = {
      listByProject: vi.fn(async () => datasets),
      update
    } as unknown as DatasetRepository;

    const projectDatasets = await ensureProjectDatasetSqlNames('project-1', repository);

    expect(projectDatasets).toHaveLength(1);
    expect(projectDatasets[0].datasetId).toBe('11111111-1111-1111-1111-111111111111');
    expect(projectDatasets[0].metadata?.sqlName).toBe('customers');
    expect(update).not.toHaveBeenCalled();
  });

  it('rewrites logical SQL names to physical names', () => {
    const registry = buildProjectSqlRegistry([
      createDataset({
        datasetId: '11111111-1111-1111-1111-111111111111',
        filename: 'customers.csv',
        metadata: {
          sqlName: 'customers',
          tableName: 'customers_11111111'
        }
      })
    ]);

    const rewritten = rewriteProjectSqlToPhysical(
      'SELECT COUNT(*) FROM customers WHERE id > 10 LIMIT 25',
      registry
    );

    expect(rewritten.sql).toContain('customers_11111111');
    expect(rewritten.referencedTables).toEqual(['customers_11111111']);
  });

  it('does not rewrite CTE aliases that match logical dataset names', () => {
    const registry = buildProjectSqlRegistry([
      createDataset({
        datasetId: '11111111-1111-1111-1111-111111111111',
        filename: 'sales.csv',
        metadata: {
          sqlName: 'sales',
          tableName: 'sales_11111111'
        }
      })
    ]);

    const rewritten = rewriteProjectSqlToPhysical(
      `
        WITH sales AS (
          SELECT * FROM sales
        )
        SELECT * FROM sales
      `,
      registry
    );

    expect(rewritten.sql).toContain('sales_11111111');
    expect(rewritten.referencedTables).toEqual(['sales_11111111']);
  });
});
