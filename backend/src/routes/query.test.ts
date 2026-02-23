import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';



// Mock the database module
vi.mock('../db.js', () => ({
  hasDatabaseConfiguration: vi.fn()
}));

// Mock the query services
vi.mock('../services/queryCache.js', () => ({
  getCachedQueryResult: vi.fn(),
  storeCachedQueryResult: vi.fn()
}));

vi.mock('../services/sqlExecutor.js', () => ({
  executeReadOnlyQuery: vi.fn()
}));

vi.mock('../services/nlToSql.js', () => ({
  generateSqlFromNaturalLanguage: vi.fn()
}));

import { hasDatabaseConfiguration } from '../db.js';
import { generateSqlFromNaturalLanguage } from '../services/nlToSql.js';
import { getCachedQueryResult, storeCachedQueryResult } from '../services/queryCache.js';
import { executeReadOnlyQuery } from '../services/sqlExecutor.js';
import { canListen } from '../tests/canListen.js';

import { createQueryRouter } from './query.js';

const canBind = await canListen();
const describeIf = canBind ? describe : describe.skip;

const mockHasDatabaseConfiguration = vi.mocked(hasDatabaseConfiguration);
const mockGetCachedQueryResult = vi.mocked(getCachedQueryResult);
const mockStoreCachedQueryResult = vi.mocked(storeCachedQueryResult);
const mockExecuteReadOnlyQuery = vi.mocked(executeReadOnlyQuery);
const mockGenerateSqlFromNaturalLanguage = vi.mocked(generateSqlFromNaturalLanguage);

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createQueryRouter());
  return app;
}

describeIf('query routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasDatabaseConfiguration.mockReturnValue(true);
  });

  describe('POST /api/query/sql', () => {
    it('returns 400 when projectId is missing', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({ sql: 'SELECT 1' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('returns 400 when sql is missing', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({ projectId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('returns 400 when projectId is not a valid UUID', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({ projectId: 'not-a-uuid', sql: 'SELECT 1' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('returns 503 when database is not configured', async () => {
      mockHasDatabaseConfiguration.mockReturnValue(false);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          sql: 'SELECT 1'
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Database is not configured for SQL execution');
    });

    it('returns cached result when available', async () => {
      const cachedResult = {
        queryId: 'cached-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1, name: 'cached' }],
        columns: [{ name: 'id' }, { name: 'name' }],
        rowCount: 1,
        executionMs: 10,
        cached: true
      };
      mockGetCachedQueryResult.mockResolvedValue(cachedResult);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          sql: 'SELECT * FROM users'
        });

      expect(response.status).toBe(200);
      expect(response.body.query).toEqual(cachedResult);
      expect(mockExecuteReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('executes query and caches result when not cached', async () => {
      mockGetCachedQueryResult.mockResolvedValue(null);
      const queryResult = {
        queryId: 'new-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1, name: 'new' }],
        columns: [{ name: 'id' }, { name: 'name' }],
        rowCount: 1,
        executionMs: 15,
        cached: false
      };
      mockExecuteReadOnlyQuery.mockResolvedValue(queryResult);
      mockStoreCachedQueryResult.mockResolvedValue(undefined);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          sql: 'SELECT * FROM users'
        });

      expect(response.status).toBe(200);
      expect(response.body.query).toEqual(queryResult);
      expect(mockExecuteReadOnlyQuery).toHaveBeenCalledWith({ sql: 'SELECT * FROM users' });
      expect(mockStoreCachedQueryResult).toHaveBeenCalled();
    });

    it('returns error when query execution fails', async () => {
      mockGetCachedQueryResult.mockResolvedValue(null);
      mockExecuteReadOnlyQuery.mockRejectedValue(new Error('Query timeout'));

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          sql: 'SELECT * FROM users'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Query timeout');
    });

    it('uses custom status code from error when available', async () => {
      mockGetCachedQueryResult.mockResolvedValue(null);
      const error = new Error('Query validation failed');
      (error as Error & { statusCode: number }).statusCode = 422;
      mockExecuteReadOnlyQuery.mockRejectedValue(error);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          sql: 'DROP TABLE users'
        });

      expect(response.status).toBe(422);
    });
  });

  describe('POST /api/query/nl', () => {
    it('returns 400 when projectId is missing', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl')
        .send({ query: 'show all users' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('returns 400 when query is missing', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl')
        .send({ projectId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('returns 400 when query is too short', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          query: 'ab'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it('returns 503 when database is not configured', async () => {
      mockHasDatabaseConfiguration.mockReturnValue(false);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          query: 'show all users'
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toMatch(/not configured/);
    });

    it('generates SQL from natural language and executes it', async () => {
      mockGenerateSqlFromNaturalLanguage.mockReturnValue({
        sql: 'SELECT * FROM users',
        rationale: 'Fetching all users',
        queryId: 'test-query-id'
      });
      mockGetCachedQueryResult.mockResolvedValue(null);
      const queryResult = {
        queryId: 'exec-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1 }],
        columns: [{ name: 'id' }],
        rowCount: 1,
        executionMs: 20,
        cached: false
      };
      mockExecuteReadOnlyQuery.mockResolvedValue(queryResult);
      mockStoreCachedQueryResult.mockResolvedValue(undefined);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          query: 'show all users'
        });

      expect(response.status).toBe(200);
      expect(response.body.nl.sql).toBe('SELECT * FROM users');
      expect(response.body.nl.rationale).toBe('Fetching all users');
      expect(response.body.nl.cached).toBe(false);
      expect(response.body.nl.query).toEqual(queryResult);
    });

    it('returns cached result for generated SQL', async () => {
      mockGenerateSqlFromNaturalLanguage.mockReturnValue({
        sql: 'SELECT * FROM users',
        rationale: 'Fetching all users',
        queryId: 'test-query-id'
      });
      const cachedResult = {
        queryId: 'cached-nl-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1 }],
        columns: [{ name: 'id' }],
        rowCount: 1,
        executionMs: 5,
        cached: true
      };
      mockGetCachedQueryResult.mockResolvedValue(cachedResult);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          query: 'show all users'
        });

      expect(response.status).toBe(200);
      expect(response.body.nl.cached).toBe(true);
      expect(response.body.nl.query).toEqual(cachedResult);
      expect(mockExecuteReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('returns error when NL processing fails', async () => {
      mockGenerateSqlFromNaturalLanguage.mockImplementation(() => {
        throw new Error('Failed to parse query');
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          query: 'gibberish query text'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Failed to parse query');
    });
  });

  describe('GET /api/query/cache/config', () => {
    it('returns cache configuration', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/query/cache/config');

      expect(response.status).toBe(200);
      expect(response.body.ttlMs).toBeDefined();
      expect(response.body.maxEntries).toBeDefined();
      expect(response.body.sqlDefaultLimit).toBeDefined();
      expect(response.body.sqlMaxRows).toBeDefined();
    });

    it('returns JSON content type', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/query/cache/config');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
