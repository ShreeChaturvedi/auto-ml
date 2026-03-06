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

vi.mock('../services/nlToSqlV2.js', () => ({
  generateSqlFromNaturalLanguageV2: vi.fn(),
  repairSqlFromExecutionErrorV2: vi.fn()
}));

vi.mock('../services/nlSuggestions.js', () => ({
  getNaturalLanguageSuggestions: vi.fn()
}));

import { hasDatabaseConfiguration } from '../db.js';
import { getNaturalLanguageSuggestions } from '../services/nlSuggestions.js';
import { generateSqlFromNaturalLanguageV2, repairSqlFromExecutionErrorV2 } from '../services/nlToSqlV2.js';
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
const mockGenerateSqlFromNaturalLanguageV2 = vi.mocked(generateSqlFromNaturalLanguageV2);
const mockRepairSqlFromExecutionErrorV2 = vi.mocked(repairSqlFromExecutionErrorV2);
const mockGetNaturalLanguageSuggestions = vi.mocked(getNaturalLanguageSuggestions);
const TEST_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

type NdjsonEvent = Record<string, unknown>;
type NdjsonResultEvent = NdjsonEvent & {
  type: 'result';
  nl: {
    sql: string;
    explanation: { intentSummary: string };
    queryExecutionError: string | null;
  };
};

function parseNdjsonEvents(payload: string): NdjsonEvent[] {
  return payload
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as NdjsonEvent);
}

function findEventIndex(
  events: NdjsonEvent[],
  predicate: (event: NdjsonEvent) => boolean
): number {
  return events.findIndex((event) => predicate(event));
}

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
    mockRepairSqlFromExecutionErrorV2.mockRejectedValue(new Error('repair unavailable'));
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
        columns: [{ name: 'id', dataTypeID: 23, dataType: 'int4' }, { name: 'name', dataTypeID: 25, dataType: 'text' }],
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

    it('re-executes query when cached result is missing resolved column types', async () => {
      const staleCachedResult = {
        queryId: 'cached-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1, name: 'cached' }],
        columns: [{ name: 'id', dataTypeID: 23 }, { name: 'name', dataTypeID: 25 }],
        rowCount: 1,
        executionMs: 10,
        cached: true
      };
      const freshResult = {
        queryId: 'fresh-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1, name: 'fresh' }],
        columns: [{ name: 'id', dataTypeID: 23, dataType: 'int4' }, { name: 'name', dataTypeID: 25, dataType: 'text' }],
        rowCount: 1,
        executionMs: 15,
        cached: false
      };
      mockGetCachedQueryResult.mockResolvedValue(staleCachedResult);
      mockExecuteReadOnlyQuery.mockResolvedValue(freshResult);
      mockStoreCachedQueryResult.mockResolvedValue(undefined);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          sql: 'SELECT * FROM users'
        });

      expect(response.status).toBe(200);
      expect(response.body.query).toEqual(freshResult);
      expect(mockExecuteReadOnlyQuery).toHaveBeenCalledWith({ sql: 'SELECT * FROM users' });
      expect(mockStoreCachedQueryResult).toHaveBeenCalled();
    });

    it('re-executes query when cached result has unknown data types', async () => {
      const staleCachedResult = {
        queryId: 'cached-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1, name: 'cached' }],
        columns: [{ name: 'id', dataTypeID: 23, dataType: 'unknown' }],
        rowCount: 1,
        executionMs: 10,
        cached: true
      };
      const freshResult = {
        queryId: 'fresh-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1, name: 'fresh' }],
        columns: [{ name: 'id', dataTypeID: 23, dataType: 'int4' }],
        rowCount: 1,
        executionMs: 15,
        cached: false
      };
      mockGetCachedQueryResult.mockResolvedValue(staleCachedResult);
      mockExecuteReadOnlyQuery.mockResolvedValue(freshResult);
      mockStoreCachedQueryResult.mockResolvedValue(undefined);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/sql')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          sql: 'SELECT * FROM users'
        });

      expect(response.status).toBe(200);
      expect(response.body.query).toEqual(freshResult);
      expect(mockExecuteReadOnlyQuery).toHaveBeenCalledWith({ sql: 'SELECT * FROM users' });
      expect(mockStoreCachedQueryResult).toHaveBeenCalled();
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
      mockGenerateSqlFromNaturalLanguageV2.mockResolvedValue({
        sql: 'SELECT * FROM users',
        rationale: 'Fetching all users',
        queryId: 'test-query-id',
        provider: {
          id: 'openai',
          label: 'OpenAI',
          model: 'gpt-5.4'
        },
        explanation: {
          intentSummary: 'Fetch users',
          selectedTables: ['users'],
          joinPlan: [],
          filters: [],
          aggregations: [],
          assumptions: [],
          validationNotes: [],
          confidence: 0.9,
          warningLevel: 'none',
          confidenceMode: 'model',
          reliabilityTier: 'high'
        }
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
      expect(response.body.nl.provider).toEqual({
        id: 'openai',
        label: 'OpenAI',
        model: 'gpt-5.4'
      });
      expect(response.body.nl.explanation.intentSummary).toBe('Fetch users');
      expect(response.body.nl.explanation.confidenceMode).toBe('model');
      expect(response.body.nl.explanation.reliabilityTier).toBe('high');
      expect(response.body.nl.cached).toBe(false);
      expect(response.body.nl.query).toEqual(queryResult);
      expect(response.body.nl.queryExecutionError).toBeNull();
    });

    it('returns cached result for generated SQL', async () => {
      mockGenerateSqlFromNaturalLanguageV2.mockResolvedValue({
        sql: 'SELECT * FROM users',
        rationale: 'Fetching all users',
        queryId: 'test-query-id',
        provider: {
          id: 'openai',
          label: 'OpenAI',
          model: 'gpt-5.4'
        },
        explanation: {
          intentSummary: 'Fetch users',
          selectedTables: ['users'],
          joinPlan: [],
          filters: [],
          aggregations: [],
          assumptions: [],
          validationNotes: [],
          confidence: 0.9,
          warningLevel: 'none',
          confidenceMode: 'model',
          reliabilityTier: 'high'
        }
      });
      const cachedResult = {
        queryId: 'cached-nl-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1 }],
        columns: [{ name: 'id', dataTypeID: 23, dataType: 'int4' }],
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
      expect(response.body.nl.explanation.selectedTables).toEqual(['users']);
      expect(response.body.nl.cached).toBe(true);
      expect(response.body.nl.query).toEqual(cachedResult);
      expect(response.body.nl.queryExecutionError).toBeNull();
      expect(mockExecuteReadOnlyQuery).not.toHaveBeenCalled();
    });

    it('returns generated SQL even when execution fails', async () => {
      mockGenerateSqlFromNaturalLanguageV2.mockResolvedValue({
        sql: 'SELECT * FROM missing_table',
        rationale: 'Attempt to fetch records',
        queryId: 'test-query-id',
        provider: {
          id: 'openai',
          label: 'OpenAI',
          model: 'gpt-5.4'
        },
        explanation: {
          intentSummary: 'Fetch records',
          selectedTables: ['missing_table'],
          joinPlan: [],
          filters: [],
          aggregations: [],
          assumptions: [],
          validationNotes: [],
          confidence: 0.5,
          warningLevel: 'medium',
          confidenceMode: 'model',
          reliabilityTier: 'low'
        }
      });
      mockGetCachedQueryResult.mockResolvedValue(null);
      mockExecuteReadOnlyQuery.mockRejectedValue(new Error('relation "missing_table" does not exist'));

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          query: 'show data from missing table'
        });

      expect(response.status).toBe(200);
      expect(response.body.nl.sql).toBe('SELECT * FROM missing_table');
      expect(response.body.nl.query).toBeNull();
      expect(response.body.nl.queryExecutionError).toContain('missing_table');
      expect(mockStoreCachedQueryResult).not.toHaveBeenCalled();
      expect(mockRepairSqlFromExecutionErrorV2).toHaveBeenCalled();
    });

    it('returns repaired SQL result when repair succeeds', async () => {
      mockGenerateSqlFromNaturalLanguageV2.mockResolvedValue({
        sql: 'SELECT AVG(eoc) FROM checkpoints_eoc',
        rationale: 'Compute average EOC',
        queryId: 'gen-query-id',
        provider: {
          id: 'openai',
          label: 'OpenAI',
          model: 'gpt-5.4'
        },
        explanation: {
          intentSummary: 'Compute average EOC score',
          selectedTables: ['checkpoints_eoc'],
          joinPlan: [],
          filters: [],
          aggregations: ['average eoc'],
          assumptions: [],
          validationNotes: [],
          confidence: 0.92,
          warningLevel: 'none',
          confidenceMode: 'model',
          reliabilityTier: 'high'
        }
      });
      mockGetCachedQueryResult.mockResolvedValue(null);
      mockExecuteReadOnlyQuery
        .mockRejectedValueOnce(new Error('column "eoc" does not exist'))
        .mockResolvedValueOnce({
          queryId: 'repaired-query-id',
          sql: 'SELECT AVG(response) FROM checkpoints_eoc',
          rows: [{ avg: 88.2 }],
          columns: [{ name: 'avg', dataTypeID: 701, dataType: 'float8' }],
          rowCount: 1,
          executionMs: 12,
          cached: false
        });
      mockRepairSqlFromExecutionErrorV2.mockResolvedValue({
        sql: 'SELECT AVG(response) FROM checkpoints_eoc',
        rationale: 'Use response column instead of eoc.',
        queryId: 'repair-id',
        provider: {
          id: 'openai',
          label: 'OpenAI',
          model: 'gpt-5.4'
        },
        explanation: {
          intentSummary: 'Compute average response score',
          selectedTables: ['checkpoints_eoc'],
          joinPlan: [],
          filters: [],
          aggregations: ['average response'],
          assumptions: ['response represents score'],
          validationNotes: ['auto-repaired'],
          confidence: 0.74,
          warningLevel: 'low',
          confidenceMode: 'repair',
          reliabilityTier: 'medium'
        }
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          query: 'highest performing students by eoc'
        });

      expect(response.status).toBe(200);
      expect(response.body.nl.sql).toContain('AVG(response)');
      expect(response.body.nl.queryExecutionError).toBeNull();
      expect(response.body.nl.query.rows).toEqual([{ avg: 88.2 }]);
      expect(mockRepairSqlFromExecutionErrorV2).toHaveBeenCalled();
      expect(mockExecuteReadOnlyQuery).toHaveBeenCalledTimes(2);
    });

    it('returns error when NL processing fails', async () => {
      mockGenerateSqlFromNaturalLanguageV2.mockRejectedValue(new Error('Failed to parse query'));

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

  describe('POST /api/query/nl/stream', () => {
    it('streams phase events, result payload, and terminal done event', async () => {
      mockGenerateSqlFromNaturalLanguageV2.mockImplementation(async (input) => {
        input.onProgress?.({
          phaseId: 'schema_context',
          status: 'started',
          summary: 'Building schema context.',
          timestamp: new Date().toISOString()
        });
        input.onProgress?.({
          phaseId: 'schema_context',
          status: 'completed',
          summary: 'Schema context ready.',
          timestamp: new Date().toISOString()
        });
        return {
          sql: 'SELECT * FROM users',
          rationale: 'Fetching all users',
          queryId: 'stream-query-id',
          provider: {
            id: 'openai',
            label: 'OpenAI',
            model: 'gpt-5.4'
          },
          explanation: {
            intentSummary: 'Fetch users',
            selectedTables: ['users'],
            joinPlan: [],
            filters: [],
            aggregations: [],
            assumptions: [],
            validationNotes: [],
            confidence: 0.9,
            warningLevel: 'none',
            confidenceMode: 'model',
            reliabilityTier: 'high'
          }
        };
      });
      mockGetCachedQueryResult.mockResolvedValue(null);
      mockExecuteReadOnlyQuery.mockResolvedValue({
        queryId: 'exec-query-id',
        sql: 'SELECT * FROM users',
        rows: [{ id: 1 }],
        columns: [{ name: 'id' }],
        rowCount: 1,
        executionMs: 14,
        cached: false
      });
      mockStoreCachedQueryResult.mockResolvedValue(undefined);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl/stream')
        .send({
          projectId: TEST_PROJECT_ID,
          query: 'show all users'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/x-ndjson/);

      const events = parseNdjsonEvents(response.text);
      expect(events.some((event) => event.type === 'phase_started' && event.phaseId === 'schema_context')).toBe(true);
      expect(events.some((event) => event.type === 'phase_completed' && event.phaseId === 'done')).toBe(true);

      const resultEvent = events.find((event) => event.type === 'result') as NdjsonResultEvent | undefined;
      expect(resultEvent).toBeDefined();
      if (!resultEvent || resultEvent.type !== 'result') {
        throw new Error('Expected result event in NDJSON stream.');
      }
      expect(resultEvent.nl.sql).toBe('SELECT * FROM users');
      expect(resultEvent.nl.explanation.intentSummary).toBe('Fetch users');
      expect(resultEvent.nl.queryExecutionError).toBeNull();

      expect(events.at(-1)?.type).toBe('done');
    });

    it('streams phase_progress events with details and orders result before done-phase', async () => {
      mockGenerateSqlFromNaturalLanguageV2.mockImplementation(async (input) => {
        input.onProgress?.({
          phaseId: 'sql_generation',
          status: 'progress',
          summary: 'Retrying with compact fallback.',
          timestamp: new Date().toISOString(),
          details: { attempt: 2, path: 'compact' }
        });

        return {
          sql: 'SELECT * FROM users LIMIT 25',
          rationale: 'Fallback SQL generation.',
          queryId: 'stream-progress-id',
          provider: {
            id: 'openai',
            label: 'OpenAI',
            model: 'gpt-5.4'
          },
          explanation: {
            intentSummary: 'Fetch users quickly',
            selectedTables: ['users'],
            joinPlan: [],
            filters: [],
            aggregations: [],
            assumptions: [],
            validationNotes: [],
            confidence: 0.78,
            warningLevel: 'low',
            confidenceMode: 'model',
            reliabilityTier: 'medium'
          }
        };
      });
      mockGetCachedQueryResult.mockResolvedValue({
        queryId: 'cached-query-id',
        sql: 'SELECT * FROM users LIMIT 25',
        rows: [{ id: 1 }],
        columns: [{ name: 'id', dataTypeID: 23, dataType: 'int4' }],
        rowCount: 1,
        executionMs: 7,
        cached: true
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl/stream')
        .send({
          projectId: TEST_PROJECT_ID,
          query: 'show all users'
        });

      expect(response.status).toBe(200);
      const events = parseNdjsonEvents(response.text);

      const progressEvent = events.find((event) =>
        event.type === 'phase_progress' && event.phaseId === 'sql_generation'
      );
      expect(progressEvent).toBeDefined();
      expect(progressEvent?.details).toEqual({ attempt: 2, path: 'compact' });

      const donePhaseIndex = findEventIndex(events, (event) =>
        event.type === 'phase_completed' && event.phaseId === 'done'
      );
      const resultIndex = findEventIndex(events, (event) => event.type === 'result');
      expect(donePhaseIndex).toBeGreaterThan(-1);
      expect(resultIndex).toBeGreaterThan(-1);
      expect(resultIndex).toBeLessThan(donePhaseIndex);
      expect(events.at(-1)?.type).toBe('done');
    });

    it('streams mapped model work events before the final result', async () => {
      mockGenerateSqlFromNaturalLanguageV2.mockImplementation(async (input) => {
        input.onModelWork?.({
          type: 'model_work_block_started',
          blockId: 'plan-1',
          phaseId: 'planning',
          kind: 'plan',
          title: 'Query planning',
          timestamp: new Date().toISOString()
        });
        input.onModelWork?.({
          type: 'model_work_delta',
          blockId: 'plan-1',
          phaseId: 'planning',
          kind: 'plan',
          title: 'Query planning',
          delta: 'Selecting the `users` table and a basic projection.',
          timestamp: new Date().toISOString()
        });
        input.onModelWork?.({
          type: 'model_work_block_started',
          blockId: 'tool-1',
          phaseId: 'planning',
          kind: 'tool',
          title: 'Tool call: inspect_schema',
          timestamp: new Date().toISOString()
        });
        input.onModelWork?.({
          type: 'model_work_delta',
          blockId: 'tool-1',
          phaseId: 'planning',
          kind: 'tool',
          title: 'Tool call: inspect_schema',
          delta: '```json\n{"table":"users"}\n```',
          timestamp: new Date().toISOString()
        });
        input.onModelWork?.({
          type: 'model_work_block_completed',
          blockId: 'tool-1',
          phaseId: 'planning',
          kind: 'tool',
          title: 'Tool call: inspect_schema',
          timestamp: new Date().toISOString()
        });
        input.onModelWork?.({
          type: 'model_work_block_completed',
          blockId: 'plan-1',
          phaseId: 'planning',
          kind: 'plan',
          title: 'Query planning',
          timestamp: new Date().toISOString()
        });

        return {
          sql: 'SELECT id, name FROM users LIMIT 25',
          rationale: 'List users.',
          queryId: 'stream-model-work-id',
          provider: {
            id: 'openai',
            label: 'OpenAI',
            model: 'gpt-5.4'
          },
          explanation: {
            intentSummary: 'Fetch users',
            selectedTables: ['users'],
            joinPlan: [],
            filters: [],
            aggregations: [],
            assumptions: [],
            validationNotes: [],
            confidence: 0.9,
            warningLevel: 'none',
            confidenceMode: 'model',
            reliabilityTier: 'high'
          }
        };
      });
      mockGetCachedQueryResult.mockResolvedValue({
        queryId: 'cached-query-id',
        sql: 'SELECT id, name FROM users LIMIT 25',
        rows: [{ id: 1, name: 'Ada' }],
        columns: [{ name: 'id', dataTypeID: 23, dataType: 'int4' }],
        rowCount: 1,
        executionMs: 7,
        cached: true
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl/stream')
        .send({
          projectId: TEST_PROJECT_ID,
          query: 'list users'
        });

      expect(response.status).toBe(200);
      const events = parseNdjsonEvents(response.text);

      const completedBlocks = events.filter((event) => event.type === 'model_work_block_completed');
      const resultIndex = findEventIndex(events, (event) => event.type === 'result');
      const modelCompleteIndex = findEventIndex(events, (event) => (
        event.type === 'model_work_block_completed' && event.blockId === 'plan-1'
      ));

      expect(completedBlocks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'model_work_block_completed',
          blockId: 'plan-1',
          kind: 'plan',
          phaseId: 'planning'
        }),
        expect.objectContaining({
          type: 'model_work_block_completed',
          blockId: 'tool-1',
          kind: 'tool',
          phaseId: 'planning'
        })
      ]));
      expect(modelCompleteIndex).toBeGreaterThan(-1);
      expect(resultIndex).toBeGreaterThan(modelCompleteIndex);
    });

    it('streams initial execution failure and repair recovery progress in order', async () => {
      mockGenerateSqlFromNaturalLanguageV2.mockResolvedValue({
        sql: 'SELECT AVG(eoc) FROM checkpoints_eoc',
        rationale: 'Compute average EOC',
        queryId: 'stream-repair-gen-id',
        provider: {
          id: 'openai',
          label: 'OpenAI',
          model: 'gpt-5.4'
        },
        explanation: {
          intentSummary: 'Compute average EOC score',
          selectedTables: ['checkpoints_eoc'],
          joinPlan: [],
          filters: [],
          aggregations: ['average eoc'],
          assumptions: [],
          validationNotes: [],
          confidence: 0.9,
          warningLevel: 'none',
          confidenceMode: 'model',
          reliabilityTier: 'high'
        }
      });
      mockGetCachedQueryResult.mockResolvedValue(null);
      mockExecuteReadOnlyQuery
        .mockRejectedValueOnce(new Error('column "eoc" does not exist'))
        .mockResolvedValueOnce({
          queryId: 'stream-repair-exec-id',
          sql: 'SELECT AVG(response) FROM checkpoints_eoc',
          rows: [{ avg: 88.2 }],
          columns: [{ name: 'avg', dataTypeID: 701, dataType: 'float8' }],
          rowCount: 1,
          executionMs: 9,
          cached: false
        });
      mockRepairSqlFromExecutionErrorV2.mockImplementation(async (input) => {
        input.onProgress?.({
          phaseId: 'repair',
          status: 'started',
          summary: 'Repairing SQL from execution failure.',
          timestamp: new Date().toISOString()
        });
        input.onProgress?.({
          phaseId: 'repair',
          status: 'completed',
          summary: 'Repaired SQL generated.',
          timestamp: new Date().toISOString()
        });

        return {
          sql: 'SELECT AVG(response) FROM checkpoints_eoc',
          rationale: 'Use response column instead of eoc.',
          queryId: 'stream-repair-id',
          provider: {
            id: 'openai',
            label: 'OpenAI',
            model: 'gpt-5.4'
          },
          explanation: {
            intentSummary: 'Compute average response score',
            selectedTables: ['checkpoints_eoc'],
            joinPlan: [],
            filters: [],
            aggregations: ['average response'],
            assumptions: ['response is the score column'],
            validationNotes: ['auto-repaired'],
            confidence: 0.73,
            warningLevel: 'low',
            confidenceMode: 'repair',
            reliabilityTier: 'medium'
          }
        };
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl/stream')
        .send({
          projectId: TEST_PROJECT_ID,
          query: 'highest performing students by eoc'
        });

      expect(response.status).toBe(200);
      const events = parseNdjsonEvents(response.text);

      const generatedFailureIndex = findEventIndex(events, (event) =>
        event.type === 'phase_failed'
        && event.phaseId === 'initial_execution'
        && typeof event.summary === 'string'
        && event.summary.includes('Generated SQL execution failed')
      );
      const repairStartedIndex = findEventIndex(events, (event) =>
        event.type === 'phase_started' && event.phaseId === 'repair'
      );
      const repairCompletedIndex = findEventIndex(events, (event) =>
        event.type === 'phase_completed' && event.phaseId === 'repair'
      );
      const repairedProgressIndex = findEventIndex(events, (event) =>
        event.type === 'phase_progress'
        && event.phaseId === 'initial_execution'
        && event.summary === 'Executing repaired SQL for validation.'
      );
      const repairedCompletedIndex = findEventIndex(events, (event) =>
        event.type === 'phase_completed'
        && event.phaseId === 'initial_execution'
        && event.summary === 'Repaired SQL executed successfully.'
      );

      expect(generatedFailureIndex).toBeGreaterThan(-1);
      expect(repairStartedIndex).toBeGreaterThan(generatedFailureIndex);
      expect(repairCompletedIndex).toBeGreaterThan(repairStartedIndex);
      expect(repairedProgressIndex).toBeGreaterThan(repairCompletedIndex);
      expect(repairedCompletedIndex).toBeGreaterThan(repairedProgressIndex);

      const resultEvent = events.find((event) => event.type === 'result') as NdjsonResultEvent | undefined;
      expect(resultEvent).toBeDefined();
      expect(resultEvent?.nl?.sql).toContain('AVG(response)');
      expect(resultEvent?.nl?.queryExecutionError).toBeNull();
    });

    it('streams failed done phase when generation throws', async () => {
      mockGenerateSqlFromNaturalLanguageV2.mockRejectedValue(new Error('provider unavailable'));

      const app = createTestApp();
      const response = await request(app)
        .post('/api/query/nl/stream')
        .send({
          projectId: TEST_PROJECT_ID,
          query: 'show all users'
        });

      expect(response.status).toBe(200);
      const events = parseNdjsonEvents(response.text);
      expect(events.some((event) => event.type === 'phase_failed' && event.phaseId === 'done')).toBe(true);
      expect(events.at(-1)?.type).toBe('done');
    });
  });

  describe('GET /api/query/nl/suggestions', () => {
    it('returns cached schema-aware suggestions', async () => {
      mockGetNaturalLanguageSuggestions.mockResolvedValue({
        suggestions: [
          {
            id: 'revenue-growth-by-segment-1',
            prompt: 'Compare monthly revenue by customer segment over the last 12 months and show which segments are accelerating fastest.',
            label: 'Revenue growth by segment',
            category: 'trend',
            tables: ['orders', 'customers'],
            rationale: 'Uses orders and customer attributes.'
          }
        ],
        cached: true,
        schemaFingerprint: 'schema-hash-1'
      });

      const app = createTestApp();
      const response = await request(app)
        .get('/api/query/nl/suggestions')
        .query({ projectId: TEST_PROJECT_ID, limit: 6 });

      expect(response.status).toBe(200);
      expect(mockGetNaturalLanguageSuggestions).toHaveBeenCalledWith({
        projectId: TEST_PROJECT_ID,
        limit: 6
      });
      expect(response.body.cached).toBe(true);
      expect(response.body.suggestions).toHaveLength(1);
      expect(response.body.schemaFingerprint).toBe('schema-hash-1');
    });

    it('returns 400 for invalid suggestion query params', async () => {
      const app = createTestApp();
      const response = await request(app)
        .get('/api/query/nl/suggestions')
        .query({ projectId: 'not-a-uuid', limit: 99 });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
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
