import { describe, expect, it, vi } from 'vitest';

import type { DatasetRepository } from '../repositories/datasetRepository.js';
import type { DatasetProfile } from '../types/dataset.js';
 
import type { LlmClient, LlmRequest } from './llm/llmClient.js';
import { createNlSuggestionsService } from './nlSuggestions.js';

function buildDataset(overrides: Partial<DatasetProfile> = {}): DatasetProfile {
  return {
    datasetId: 'dataset-1',
    projectId: 'project-1',
    filename: 'orders.csv',
    fileType: 'csv',
    size: 1024,
    nRows: 1200,
    nCols: 5,
    columns: [
      { name: 'order_id', dtype: 'integer', nullCount: 0 },
      { name: 'customer_id', dtype: 'integer', nullCount: 0 },
      { name: 'order_total', dtype: 'float', nullCount: 0 },
      { name: 'order_date', dtype: 'date', nullCount: 0 }
    ],
    sample: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { tableName: 'orders' },
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

function createClient(response: string): LlmClient {
  return {
    complete: vi.fn(async () => response),
    stream: vi.fn(async () => '')
  };
}

describe('nlSuggestions service', () => {
  it('builds schema-aware suggestions and includes inferred relationship hints in the prompt', async () => {
    const repository = createDatasetRepository([
      buildDataset(),
      buildDataset({
        datasetId: 'dataset-2',
        filename: 'customers.csv',
        columns: [
          { name: 'id', dtype: 'integer', nullCount: 0 },
          { name: 'segment', dtype: 'string', nullCount: 0 },
          { name: 'region', dtype: 'string', nullCount: 0 }
        ],
        metadata: { tableName: 'customers' }
      })
    ]);
    const client = createClient(JSON.stringify({
      suggestions: [
        {
          prompt: 'Compare monthly order revenue by customer segment over the last 12 months and highlight segments with the fastest growth rate.',
          label: 'Revenue growth by segment',
          category: 'trend',
          tables: ['orders', 'customers'],
          rationale: 'Uses order_date, order_total, and customer segmentation fields.'
        },
        {
          prompt: 'Identify customers whose average order value increased by more than 20% quarter over quarter, grouped by region.',
          label: 'Quarterly AOV acceleration',
          category: 'segmentation',
          tables: ['orders', 'customers'],
          rationale: 'Combines order totals with customer region to surface meaningful change.'
        },
        {
          prompt: 'Show the top 10 customer segments by total revenue and average order size for the most recent quarter.',
          label: 'Top segments this quarter',
          category: 'top_n',
          tables: ['orders', 'customers'],
          rationale: 'Good executive summary using revenue and order size.'
        },
        {
          prompt: 'Find regions where order volume is stable but total revenue is declining month over month, and include the percent change.',
          label: 'Volume stable revenue down',
          category: 'exceptions',
          tables: ['orders', 'customers'],
          rationale: 'Pairs operational stability with negative business drift.'
        }
      ]
    }));

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      getClient: () => client,
      now: () => 1000,
      cacheTtlMs: 60_000
    });

    const result = await service.getSuggestions({ projectId: 'project-1', limit: 4 });

    expect(result.cached).toBe(false);
    expect(result.suggestions).toHaveLength(4);
    expect(result.suggestions[0]?.prompt).toContain('monthly order revenue');

    const request = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as LlmRequest;
    expect(request.messages[1]?.content).toContain('orders');
    expect(request.messages[1]?.content).toContain('customers');
    expect(request.messages[1]?.content).toContain('orders.customer_id -> customers.id');
  });

  it('reuses cached suggestions until the schema fingerprint changes', async () => {
    const repository = createDatasetRepository([buildDataset()]);
    const client = createClient(JSON.stringify({
      suggestions: [
        {
          prompt: 'Show weekly order revenue and average order value for the last 8 weeks.',
          label: 'Weekly revenue and AOV',
          category: 'trend',
          tables: ['orders'],
          rationale: 'Uses order_date and order_total.'
        },
        {
          prompt: 'List the top 15 days with the highest order revenue and order counts this quarter.',
          label: 'Top revenue days',
          category: 'top_n',
          tables: ['orders'],
          rationale: 'Ranks strong revenue days.'
        },
        {
          prompt: 'Find dates where order count rose but average order value fell compared with the prior week.',
          label: 'Count up AOV down',
          category: 'exceptions',
          tables: ['orders'],
          rationale: 'Surfaces mixed operational and business signals.'
        },
        {
          prompt: 'Break down monthly revenue contribution by order size band to understand mix shifts over time.',
          label: 'Revenue mix by order size',
          category: 'segmentation',
          tables: ['orders'],
          rationale: 'Creates a useful mix analysis from order_total.'
        }
      ]
    }));

    let now = 1_000;
    const service = createNlSuggestionsService({
      datasetRepository: repository,
      getClient: () => client,
      now: () => now,
      cacheTtlMs: 60_000
    });

    const first = await service.getSuggestions({ projectId: 'project-1', limit: 4 });
    const second = await service.getSuggestions({ projectId: 'project-1', limit: 4 });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    now += 61_000;
    const third = await service.getSuggestions({ projectId: 'project-1', limit: 4 });
    expect(third.cached).toBe(false);
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('throws when no project datasets are available', async () => {
    const repository = createDatasetRepository([]);
    const client = createClient(JSON.stringify({ suggestions: [] }));

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      getClient: () => client
    });

    await expect(
      service.getSuggestions({ projectId: 'project-1' })
    ).rejects.toThrow(/no dataset schema is available/i);
  });
});
