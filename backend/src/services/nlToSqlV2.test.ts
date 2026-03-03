import { describe, expect, it, vi } from 'vitest';

import type { DatasetRepository } from '../repositories/datasetRepository.js';
import type { DatasetProfile } from '../types/dataset.js';
import type { LlmClient, LlmRequest, LlmStreamHandlers } from './llm/llmClient.js';
import { createNl2SqlService } from './nlToSqlV2.js';

function buildDataset(overrides: Partial<DatasetProfile> = {}): DatasetProfile {
  return {
    datasetId: 'dataset-1',
    projectId: 'project-1',
    filename: 'users.csv',
    fileType: 'csv',
    size: 100,
    nRows: 1000,
    nCols: 3,
    columns: [
      { name: 'id', dtype: 'integer', nullCount: 0 },
      { name: 'name', dtype: 'string', nullCount: 0 },
      { name: 'account_id', dtype: 'integer', nullCount: 10 }
    ],
    sample: [{ id: 1, name: 'Ada', account_id: 2 }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { tableName: 'users' },
    ...overrides
  };
}

function createDatasetRepository(datasets: DatasetProfile[]): DatasetRepository {
  return {
    list: vi.fn(async () => datasets),
    get: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as DatasetRepository;
}

function createClientFromResponses(responses: Array<string | Error>): LlmClient {
  return {
    complete: vi.fn(async (_request: LlmRequest) => {
      const next = responses.shift();
      if (next === undefined) {
        throw new Error('No more mock responses configured');
      }
      if (next instanceof Error) {
        throw next;
      }
      return next;
    }),
    stream: vi.fn(async (_request: LlmRequest, _handlers: LlmStreamHandlers) => {
      throw new Error('stream is not used in nlToSqlV2');
    })
  };
}

describe('nlToSqlV2 service', () => {
  it('generates SQL + structured explanation in two-pass flow', async () => {
    const repo = createDatasetRepository([
      buildDataset(),
      buildDataset({
        datasetId: 'dataset-2',
        filename: 'accounts.csv',
        columns: [
          { name: 'id', dtype: 'integer', nullCount: 0 },
          { name: 'plan', dtype: 'string', nullCount: 0 }
        ],
        metadata: { tableName: 'accounts' }
      })
    ]);

    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: 'Show users with account plan',
        selectedTables: ['users', 'accounts'],
        joinPlan: [
          {
            leftTable: 'users',
            leftColumn: 'account_id',
            rightTable: 'accounts',
            rightColumn: 'id',
            joinType: 'inner',
            confidence: 0.82,
            reason: 'users.account_id references accounts.id'
          }
        ],
        filters: [],
        aggregations: [],
        assumptions: [],
        confidence: 0.84
      }),
      JSON.stringify({
        sql: 'SELECT u.name, a.plan FROM users u JOIN accounts a ON u.account_id = a.id LIMIT 50',
        rationale: 'Join users to accounts using account_id.',
        intentSummary: 'Show users and account plan',
        selectedTables: ['users', 'accounts'],
        joinPlan: [
          {
            leftTable: 'users',
            leftColumn: 'account_id',
            rightTable: 'accounts',
            rightColumn: 'id',
            joinType: 'inner',
            confidence: 0.82,
            reason: 'users.account_id references accounts.id'
          }
        ],
        filters: [],
        aggregations: [],
        assumptions: [],
        validationNotes: ['Columns are present in provided schema.'],
        confidence: 0.84
      })
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'Show users and account plan'
    });

    expect(result.sql.toLowerCase()).toContain('select');
    expect(result.rationale).toContain('Join users');
    expect(result.explanation.selectedTables).toEqual(expect.arrayContaining(['users', 'accounts']));
    expect(result.explanation.selectedTables).toHaveLength(2);
    expect(result.explanation.joinPlan).toHaveLength(1);
    expect(result.explanation.validationNotes.length).toBeGreaterThan(0);
  });

  it('retries pass-1 once when malformed JSON is returned', async () => {
    const repo = createDatasetRepository([buildDataset()]);
    const client = createClientFromResponses([
      'this is not json',
      JSON.stringify({
        intentSummary: 'List users',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: [],
        confidence: 0.9
      }),
      JSON.stringify({
        sql: 'SELECT * FROM users LIMIT 25',
        rationale: 'List users.',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: [],
        validationNotes: [],
        confidence: 0.9
      })
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'List users'
    });

    expect(result.sql).toContain('SELECT');
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it('falls back deterministically when pass-2 remains malformed after retry', async () => {
    const repo = createDatasetRepository([buildDataset()]);
    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: 'List users',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: [],
        confidence: 0.9
      }),
      'bad-json',
      'still-bad-json'
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'List users'
    });

    expect(result.sql).toContain('FROM "users"');
    expect(result.explanation.validationNotes.some((note) =>
      note.toLowerCase().includes('deterministic fallback')
    )).toBe(true);
  });

  it('returns elevated warning level for ambiguous join plans', async () => {
    const repo = createDatasetRepository([
      buildDataset(),
      buildDataset({
        datasetId: 'dataset-2',
        filename: 'events.csv',
        columns: [
          { name: 'id', dtype: 'integer', nullCount: 0 },
          { name: 'user_id', dtype: 'integer', nullCount: 0 }
        ],
        metadata: { tableName: 'events' }
      })
    ]);

    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: 'Join users and events',
        selectedTables: ['users', 'events'],
        joinPlan: [
          {
            leftTable: 'users',
            leftColumn: 'id',
            rightTable: 'events',
            rightColumn: 'id',
            joinType: 'inner',
            confidence: 0.4,
            reason: 'Generic id match'
          }
        ],
        filters: [],
        aggregations: [],
        assumptions: ['ids refer to same entity'],
        confidence: 0.48
      }),
      JSON.stringify({
        sql: 'SELECT * FROM users u JOIN events e ON u.id = e.id LIMIT 20',
        rationale: 'Joined on shared id as a best-guess.',
        selectedTables: ['users', 'events'],
        joinPlan: [
          {
            leftTable: 'users',
            leftColumn: 'id',
            rightTable: 'events',
            rightColumn: 'id',
            joinType: 'inner',
            confidence: 0.4,
            reason: 'Generic id match'
          }
        ],
        filters: [],
        aggregations: [],
        assumptions: ['ids refer to same entity'],
        validationNotes: [],
        confidence: 0.48
      })
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'Join users with events'
    });

    expect(result.explanation.warningLevel).toBe('medium');
    expect(result.explanation.assumptions.length).toBeGreaterThan(0);
  });

  it('rejects unsafe SQL from model output', async () => {
    const repo = createDatasetRepository([buildDataset()]);
    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: 'drop users',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: [],
        confidence: 0.99
      }),
      JSON.stringify({
        sql: 'DROP TABLE users',
        rationale: 'Remove users table',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: [],
        validationNotes: [],
        confidence: 0.99
      })
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    await expect(
      service.generateSqlFromNaturalLanguageV2({
        projectId: 'project-1',
        nlQuery: 'Drop users table'
      })
    ).rejects.toThrow(/only select\/cte statements are allowed/i);
  });

  it('normalizes object-shaped plan fields returned by model', async () => {
    const repo = createDatasetRepository([
      buildDataset(),
      buildDataset({
        datasetId: 'dataset-2',
        filename: 'orders.csv',
        columns: [
          { name: 'order_id', dtype: 'integer', nullCount: 0 },
          { name: 'user_id', dtype: 'integer', nullCount: 0 }
        ],
        metadata: { tableName: 'orders' }
      })
    ]);
    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: { text: 'Show average response by chapter' },
        selectedTables: [{ table: 'users' }],
        joinPlan: [],
        filters: [],
        aggregations: [
          { column: 'chapter_number', type: 'group_by' },
          { column: 'response', type: 'average' }
        ],
        assumptions: [{ text: 'response should be numeric' }],
        confidence: '0.88'
      }),
      JSON.stringify({
        sql: { query: 'SELECT chapter_number, AVG(response::float) AS avg_response FROM users GROUP BY chapter_number LIMIT 10' },
        rationale: { summary: 'Grouped by chapter and averaged response.' },
        selectedTables: [{ tableName: 'users' }],
        joinPlan: [],
        filters: [],
        aggregations: [{ metric: 'avg_response by chapter_number' }],
        assumptions: [{ note: 'Casted response to float.' }],
        validationNotes: [{ text: 'Added LIMIT 10.' }],
        confidence: '0.81'
      })
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'Show average response by chapter'
    });

    expect(result.sql.toLowerCase()).toContain('select');
    expect(result.explanation.selectedTables).toEqual(['users']);
    expect(result.explanation.aggregations.length).toBeGreaterThan(0);
    expect(result.explanation.assumptions.some((entry) => entry.toLowerCase().includes('casted'))).toBe(true);
  });

  it('does not down-rank high confidence with non-risk assumptions', async () => {
    const repo = createDatasetRepository([buildDataset()]);
    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: 'Rank students by score',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: ['EOC column represents the end-of-chapter score.'],
        confidence: 0.95
      }),
      JSON.stringify({
        sql: 'SELECT student_id, AVG(response::float) AS avg_score FROM users GROUP BY student_id LIMIT 100',
        rationale: 'Rank students by average score.',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: ['EOC column represents the end-of-chapter score.'],
        validationNotes: [],
        confidence: 0.95
      })
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'highest performing students'
    });

    expect(result.explanation.confidence).toBe(0.95);
    expect(result.explanation.warningLevel).toBe('none');
  });

  it('falls back to compact pass-2 generation when rich pass output is invalid', async () => {
    const repo = createDatasetRepository([buildDataset()]);
    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: 'List users',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: [],
        confidence: 0.8
      }),
      'not-json',
      'still-not-json',
      JSON.stringify({
        sql: 'SELECT id, name FROM users LIMIT 25',
        rationale: 'List users with id and name.',
        assumptions: ['No filters requested.'],
        confidence: 0.74
      })
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'list users'
    });

    expect(result.sql.toLowerCase()).toContain('select id, name from users');
    expect(result.explanation.validationNotes.some((note) => note.includes('compact fallback'))).toBe(true);
    expect(result.explanation.assumptions.some((entry) => entry.includes('compact fallback'))).toBe(true);
  });

  it('falls back to deterministic SQL when rich and compact passes both time out', async () => {
    const repo = createDatasetRepository([
      buildDataset({
        columns: [
          { name: 'student_id', dtype: 'string', nullCount: 0 },
          { name: 'n_correct', dtype: 'integer', nullCount: 0 },
          { name: 'n_possible', dtype: 'integer', nullCount: 0 }
        ],
        metadata: { tableName: 'checkpoints_eoc' }
      })
    ]);
    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: 'Rank students by performance',
        selectedTables: ['checkpoints_eoc'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: [],
        confidence: 0.8
      }),
      new DOMException('This operation was aborted', 'AbortError'),
      new DOMException('This operation was aborted', 'AbortError')
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'show me the highest performing students'
    });

    expect(result.sql).toContain('performance_score');
    expect(result.sql).toContain('"n_correct"');
    expect(result.sql).toContain('"n_possible"');
    expect(result.explanation.validationNotes.some((note) => note.includes('deterministic fallback'))).toBe(true);
    expect(result.explanation.confidence).toBeLessThan(0.5);
  });

  it('auto-quotes case-sensitive identifiers from schema context', async () => {
    const repo = createDatasetRepository([
      buildDataset({
        columns: [
          { name: 'student_id', dtype: 'string', nullCount: 0 },
          { name: 'EOC', dtype: 'integer', nullCount: 0 },
          { name: 'n_correct', dtype: 'integer', nullCount: 0 },
          { name: 'n_possible', dtype: 'integer', nullCount: 0 }
        ],
        metadata: { tableName: 'checkpoints_eoc' }
      })
    ]);

    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: 'Rank students by EOC score',
        selectedTables: ['checkpoints_eoc'],
        joinPlan: [],
        filters: [],
        aggregations: ['AVG(EOC)'],
        assumptions: [],
        confidence: 0.93
      }),
      JSON.stringify({
        sql: 'SELECT student_id, AVG(EOC) AS avg_eoc_score FROM checkpoints_eoc GROUP BY student_id LIMIT 50',
        rationale: 'Average EOC scores by student.',
        selectedTables: ['checkpoints_eoc'],
        joinPlan: [],
        filters: [],
        aggregations: ['AVG(EOC)'],
        assumptions: [],
        validationNotes: [],
        confidence: 0.93
      })
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'show highest performing students'
    });

    expect(result.sql).toContain('AVG("EOC")');
    expect(result.explanation.validationNotes.some((note) => note.includes('case-sensitive identifiers'))).toBe(true);
  });

  it('normalizes percentage confidence values to 0..1 range', async () => {
    const repo = createDatasetRepository([buildDataset()]);
    const client = createClientFromResponses([
      JSON.stringify({
        intentSummary: 'List users',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: [],
        confidence: 95
      }),
      JSON.stringify({
        sql: 'SELECT id, name FROM users LIMIT 25',
        rationale: 'List users.',
        selectedTables: ['users'],
        joinPlan: [],
        filters: [],
        aggregations: [],
        assumptions: [],
        validationNotes: [],
        confidence: 95
      })
    ]);

    const service = createNl2SqlService({
      datasetRepository: repo,
      getClient: () => client
    });

    const result = await service.generateSqlFromNaturalLanguageV2({
      projectId: 'project-1',
      nlQuery: 'list users'
    });

    expect(result.explanation.confidence).toBe(0.95);
  });
});
