import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { env } from '../config.js';
import { hasDatabaseConfiguration } from '../db.js';
import type { DatasetRepository } from '../repositories/datasetRepository.js';
import { regenerateNaturalLanguageSuggestions } from '../services/nlSuggestions/index.js';
import { describeRouteSuite } from '../tests/describeRouteSuite.js';
import type { DatasetProfile, DatasetProfileInput } from '../types/dataset.js';

import { createDatasetUploadRouter } from './datasets.js';

// Mock the datasetLoader to avoid needing Postgres
vi.mock('../services/datasetLoader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/datasetLoader.js')>();
  return {
    ...actual,
    loadDatasetIntoPostgres: vi.fn().mockResolvedValue({
      tableName: 'mock_table',
      rowsLoaded: 100
    }),
    parseDatasetRows: vi.fn().mockImplementation((buffer: Buffer, fileType: string) => {
      const content = buffer.toString('utf8');

      // Handle JSON files
      if (fileType === 'json') {
        try {
          const parsed = JSON.parse(content);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [];
        }
      }

      // Handle CSV files
      const lines = content.trim().split('\n');
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map(h => h.trim());
      return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row: Record<string, string | number> = {};
        headers.forEach((header, i) => {
          const val = values[i];
          const numVal = Number(val);
          row[header] = isNaN(numVal) ? val : numVal;
        });
        return row;
      });
    }),
    parseXlsxFromFile: vi.fn().mockResolvedValue([]),
    parseXlsxSample: vi.fn().mockResolvedValue({
      headers: ['id', 'name'],
      sample: [{ id: 1, name: 'Test' }],
      totalRows: 1,
      sampleRows: [{ id: 1, name: 'Test' }],
      totalRowCount: 1
    }),
    streamXlsxRows: vi.fn().mockResolvedValue({ totalRows: 0 }),
    streamXlsxSinglePass: vi.fn().mockResolvedValue({
      headers: ['id', 'name'],
      sample: [{ id: 1, name: 'Test' }],
      totalRows: 1,
      totalRowCount: 1,
      sampleRows: [{ id: 1, name: 'Test' }]
    }),
    streamLoadXlsxIntoPostgres: vi.fn().mockResolvedValue({ tableName: 'mock_table', rowsLoaded: 0 }),
    singlePassXlsxLoad: vi.fn().mockResolvedValue({ sampleRows: [], totalRowCount: 0, tableName: 'mock_table', rowsLoaded: 0, columns: [] }),
    sanitizeTableName: vi.fn().mockImplementation((filename: string, datasetId: string, addUniqueSuffix?: boolean) => {
      const baseName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
      return addUniqueSuffix ? `${baseName}_${datasetId.slice(0, 8)}` : baseName;
    })
  };
});

// Mock the db module
vi.mock('../db.js', () => ({
  getDbPool: vi.fn(),
  hasDatabaseConfiguration: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/workflows/repository/index.js', () => ({
  getWorkflowRepository: vi.fn(() => ({
    findRunsByDataset: vi.fn(async () => [])
  }))
}));

vi.mock('../services/nlSuggestions/index.js', () => ({
  regenerateNaturalLanguageSuggestions: vi.fn().mockResolvedValue({
    suggestions: [],
    cached: false,
    schemaFingerprint: 'test-schema'
  })
}));

const mockHasDatabaseConfiguration = vi.mocked(hasDatabaseConfiguration);
const mockRegenerateNaturalLanguageSuggestions = vi.mocked(regenerateNaturalLanguageSuggestions);

// In-memory dataset repository for testing
class InMemoryDatasetRepository implements DatasetRepository {
  private readonly datasets = new Map<string, DatasetProfile>();

  async list(): Promise<DatasetProfile[]> {
    return Array.from(this.datasets.values());
  }

  async listByProject(projectId: string): Promise<DatasetProfile[]> {
    return Array.from(this.datasets.values()).filter((dataset) => dataset.projectId === projectId);
  }

  async get(datasetId: string): Promise<DatasetProfile | undefined> {
    return this.datasets.get(datasetId);
  }

  async getById(datasetId: string): Promise<DatasetProfile | undefined> {
    return this.get(datasetId);
  }

  async create(input: DatasetProfileInput): Promise<DatasetProfile> {
    const now = new Date().toISOString();
    const dataset: DatasetProfile = {
      datasetId: randomUUID(),
      projectId: input.projectId,
      filename: input.filename,
      fileType: input.fileType,
      size: input.size,
      nRows: input.profile.nRows,
      nCols: input.profile.columns.length,
      columns: input.profile.columns,
      sample: input.profile.sample,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata
    };
    this.datasets.set(dataset.datasetId, dataset);
    return dataset;
  }

  async update(
    datasetId: string,
    updater: (current: DatasetProfile) => DatasetProfile
  ): Promise<DatasetProfile | undefined> {
    const existing = this.datasets.get(datasetId);
    if (!existing) return undefined;

    const updated = updater(existing);
    updated.updatedAt = new Date().toISOString();
    this.datasets.set(datasetId, updated);
    return updated;
  }

  async delete(datasetId: string): Promise<boolean> {
    return this.datasets.delete(datasetId);
  }

  // Helper for tests to add datasets directly
  addDataset(dataset: DatasetProfile): void {
    this.datasets.set(dataset.datasetId, dataset);
  }
}

function createTestApp(repository: InMemoryDatasetRepository) {
  const app = express();
  app.use(express.json());
  app.use('/api', createDatasetUploadRouter(repository));
  return app;
}

function createMockDataset(overrides?: Partial<DatasetProfile>): DatasetProfile {
  const id = randomUUID();
  return {
    datasetId: id,
    filename: 'test.csv',
    fileType: 'csv',
    size: 1024,
    nRows: 100,
    nCols: 3,
    columns: [
      { name: 'id', dtype: 'integer', nullCount: 0 },
      { name: 'name', dtype: 'string', nullCount: 2 },
      { name: 'value', dtype: 'float', nullCount: 5 }
    ],
    sample: [
      { id: 1, name: 'Test', value: 1.5 },
      { id: 2, name: 'Test2', value: 2.5 }
    ],
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

describeRouteSuite('dataset routes', () => {
  let repository: InMemoryDatasetRepository;

  beforeEach(() => {
    repository = new InMemoryDatasetRepository();
    mockHasDatabaseConfiguration.mockReturnValue(false);
    mockRegenerateNaturalLanguageSuggestions.mockClear();
  });

  describe('GET /api/datasets', () => {
    it('returns empty array when no datasets exist', async () => {
      const app = createTestApp(repository);
      const response = await request(app).get('/api/datasets');

      expect(response.status).toBe(200);
      expect(response.body.datasets).toEqual([]);
    });

    it('returns all datasets', async () => {
      repository.addDataset(createMockDataset({ filename: 'data1.csv' }));
      repository.addDataset(createMockDataset({ filename: 'data2.json', fileType: 'json' }));

      const app = createTestApp(repository);
      const response = await request(app).get('/api/datasets');

      expect(response.status).toBe(200);
      expect(response.body.datasets).toHaveLength(2);
    });

    it('includes tableName for each dataset', async () => {
      repository.addDataset(
        createMockDataset({
          filename: 'data.csv',
          metadata: { sqlName: 'data', tableName: 'data_123' }
        })
      );

      const app = createTestApp(repository);
      const response = await request(app).get('/api/datasets');

      expect(response.status).toBe(200);
      expect(response.body.datasets[0].tableName).toBe('data');
      expect(response.body.datasets[0].physicalTableName).toMatch(/^data_[a-z0-9]{8}$/);
    });

    it('filters by projectId when provided', async () => {
      const projectId = randomUUID();
      repository.addDataset(createMockDataset({ projectId, filename: 'project-data.csv' }));
      repository.addDataset(createMockDataset({ filename: 'other-data.csv' }));
      repository.addDataset(createMockDataset({ projectId, filename: 'project-data2.csv' }));

      const app = createTestApp(repository);
      const response = await request(app).get(`/api/datasets?projectId=${projectId}`);

      expect(response.status).toBe(200);
      expect(response.body.datasets).toHaveLength(2);
      expect(response.body.datasets.every((d: DatasetProfile) => d.projectId === projectId)).toBe(true);
    });

    it('returns all datasets when no projectId filter', async () => {
      const projectId = randomUUID();
      repository.addDataset(createMockDataset({ projectId }));
      repository.addDataset(createMockDataset({}));

      const app = createTestApp(repository);
      const response = await request(app).get('/api/datasets');

      expect(response.status).toBe(200);
      expect(response.body.datasets).toHaveLength(2);
    });
  });

  describe('GET /api/datasets/:datasetId/sample', () => {
    it('returns 404 for non-existent dataset', async () => {
      const app = createTestApp(repository);
      const response = await request(app).get('/api/datasets/00000000-0000-0000-0000-000000000000/sample');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dataset not found');
    });

    it('returns sample data for existing dataset', async () => {
      const dataset = createMockDataset({
        sample: [{ id: 1, name: 'Sample' }, { id: 2, name: 'Sample2' }],
        nRows: 50
      });
      repository.addDataset(dataset);

      const app = createTestApp(repository);
      const response = await request(app).get(`/api/datasets/${dataset.datasetId}/sample`);

      expect(response.status).toBe(200);
      expect(response.body.sample).toEqual(dataset.sample);
      expect(response.body.columns).toEqual(['id', 'name', 'value']);
      expect(response.body.rowCount).toBe(50);
    });
  });

  describe('GET /api/datasets/:datasetId/rows', () => {
    it('returns paged rows for an existing dataset', async () => {
      const dataset = createMockDataset({
        sample: [{ id: 1, name: 'Sample' }],
        nRows: 5,
        columns: [
          { name: 'id', dtype: 'integer', nullCount: 0 },
          { name: 'name', dtype: 'string', nullCount: 0 }
        ]
      });
      repository.addDataset(dataset);
      storeDatasetFile(dataset, 'id,name\n1,A\n2,B\n3,C\n4,D\n5,E');

      const app = createTestApp(repository);
      const response = await request(app)
        .get(`/api/datasets/${dataset.datasetId}/rows`)
        .query({ offset: 2, limit: 2 });

      expect(response.status).toBe(200);
      expect(response.body.rows).toEqual([
        { id: 3, name: 'C' },
        { id: 4, name: 'D' }
      ]);
      expect(response.body.columns).toEqual(['id', 'name']);
      expect(response.body.rowCount).toBe(5);
      expect(response.body.offset).toBe(2);
      expect(response.body.limit).toBe(2);
    });

    it('returns 400 for invalid pagination params', async () => {
      const dataset = createMockDataset();
      repository.addDataset(dataset);

      const app = createTestApp(repository);
      const response = await request(app)
        .get(`/api/datasets/${dataset.datasetId}/rows`)
        .query({ offset: -1, limit: 0 });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/datasets/:datasetId/download', () => {
    it('streams the dataset file when it exists on disk', async () => {
      const dataset = createMockDataset({ filename: 'download.csv' });
      repository.addDataset(dataset);
      storeDatasetFile(dataset, 'id,name\n1,Ada\n');

      const app = createTestApp(repository);
      const response = await request(app).get(`/api/datasets/${dataset.datasetId}/download`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('download.csv');
      expect(response.text).toContain('id,name');
      expect(response.text).toContain('Ada');
    });
  });

  describe('POST /api/upload/dataset', () => {
    it('rejects legacy XLS uploads with a clear migration message', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/upload/dataset')
        .attach('file', Buffer.from('legacy-binary'), {
          filename: 'legacy.xls',
          contentType: 'application/vnd.ms-excel'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/convert the file to \.xlsx or \.csv/i);
    });
  });

  describe('DELETE /api/datasets/:datasetId', () => {
    it('returns 404 for non-existent dataset', async () => {
      const app = createTestApp(repository);
      const response = await request(app).delete('/api/datasets/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dataset not found');
    });

    it('deletes an existing dataset', async () => {
      const projectId = randomUUID();
      const dataset = createMockDataset({ projectId });
      repository.addDataset(dataset);

      const app = createTestApp(repository);
      const response = await request(app).delete(`/api/datasets/${dataset.datasetId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const remaining = await repository.list();
      expect(remaining).toHaveLength(0);
      expect(mockRegenerateNaturalLanguageSuggestions).toHaveBeenCalledWith({ projectId });
    });

    it('only deletes the specified dataset', async () => {
      const dataset1 = createMockDataset({ filename: 'keep.csv' });
      const dataset2 = createMockDataset({ filename: 'delete.csv' });
      repository.addDataset(dataset1);
      repository.addDataset(dataset2);

      const app = createTestApp(repository);
      await request(app).delete(`/api/datasets/${dataset2.datasetId}`);

      const remaining = await repository.list();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].datasetId).toBe(dataset1.datasetId);
    });
  });

  describe('POST /api/upload/dataset', () => {
    it('returns 400 when no file is provided', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/upload/dataset')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('file field is required');
    });

    it('returns 400 for unsupported file type', async () => {
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/upload/dataset')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Unsupported file type/);
    });

    it('accepts CSV files', async () => {
      const csvContent = 'id,name,value\n1,Test,10\n2,Test2,20';
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/upload/dataset')
        .attach('file', Buffer.from(csvContent), 'data.csv');

      expect(response.status).toBe(201);
      expect(response.body.dataset).toBeDefined();
      expect(response.body.dataset.filename).toBe('data.csv');
      expect(response.body.dataset.fileType).toBe('csv');
    });

    it('accepts JSON files', async () => {
      const jsonContent = JSON.stringify([
        { id: 1, name: 'Test' },
        { id: 2, name: 'Test2' }
      ]);
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/upload/dataset')
        .attach('file', Buffer.from(jsonContent), 'data.json');

      expect(response.status).toBe(201);
      expect(response.body.dataset.fileType).toBe('json');
    });

    it('includes dataset metadata in response', async () => {
      const csvContent = 'id,name\n1,A\n2,B\n3,C';
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/upload/dataset')
        .attach('file', Buffer.from(csvContent), 'test.csv');

      expect(response.status).toBe(201);
      expect(response.body.dataset.datasetId).toBeDefined();
      expect(response.body.dataset.n_rows).toBeDefined();
      expect(response.body.dataset.columns).toBeDefined();
      expect(response.body.dataset.dtypes).toBeDefined();
      expect(response.body.dataset.createdAt).toBeDefined();
    });

    it('associates dataset with projectId when provided', async () => {
      const projectId = randomUUID();
      const csvContent = 'id,value\n1,10';
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/upload/dataset')
        .field('projectId', projectId)
        .attach('file', Buffer.from(csvContent), 'test.csv');

      expect(response.status).toBe(201);

      const datasets = await repository.list();
      expect(datasets[0].projectId).toBe(projectId);
      expect(mockRegenerateNaturalLanguageSuggestions).toHaveBeenCalledWith({ projectId });
    });

    it('prioritizes file extension over conflicting MIME type', async () => {
      const csvContent = 'id,raw\n1,foo\\u12ZZ';
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/upload/dataset')
        .field('projectId', randomUUID())
        .attach('file', Buffer.from(csvContent), {
          filename: 'conflicting.csv',
          contentType: 'application/json'
        });

      expect(response.status).toBe(201);
      expect(response.body.dataset.fileType).toBe('csv');
      expect(response.body.dataset.filename).toBe('conflicting.csv');
    });

    it('regenerates NL placeholders silently after upload when a project id is provided', async () => {
      const projectId = randomUUID();
      const csvContent = 'id,value\n1,10';
      const app = createTestApp(repository);
      const response = await request(app)
        .post('/api/upload/dataset')
        .field('projectId', projectId)
        .attach('file', Buffer.from(csvContent), 'silent.csv');

      expect(response.status).toBe(201);
      expect(mockRegenerateNaturalLanguageSuggestions).toHaveBeenCalledWith({ projectId });
    });
  });

  describe('POST /api/datasets/migrate', () => {
    it('returns 503 when database is not configured', async () => {
      const app = createTestApp(repository);
      const response = await request(app).post('/api/datasets/migrate');

      expect(response.status).toBe(503);
      expect(response.body.error).toMatch(/not configured/i);
    });

    it('returns success when database is configured and no datasets exist', async () => {
      mockHasDatabaseConfiguration.mockReturnValue(true);

      const app = createTestApp(repository);
      const response = await request(app).post('/api/datasets/migrate');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.results).toBeDefined();
    });
  });

  describe('content-type handling', () => {
    it('returns JSON content type for all responses', async () => {
      const app = createTestApp(repository);
      const response = await request(app).get('/api/datasets');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
