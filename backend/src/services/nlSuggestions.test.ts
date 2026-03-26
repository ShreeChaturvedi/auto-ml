import { describe, expect, it, vi } from 'vitest';

import type { DatasetRepository } from '../repositories/datasetRepository.js';
import type { NlSuggestionRepository } from '../repositories/nlSuggestionRepository.js';
import type { DatasetProfile } from '../types/dataset.js';

import type { LlmClient, LlmRequest } from './llm/llmClient.js';
import { createNlSuggestionsService } from './nlSuggestions/index.js';

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
    listByProject: vi.fn(async (projectId: string) => datasets.filter((dataset) => dataset.projectId === projectId)),
    get: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as DatasetRepository;
}

function createSuggestionRepository(): NlSuggestionRepository {
  const entries = new Map<string, {
    suggestionSetId: string;
    projectId: string;
    schemaFingerprint: string;
    modelId: string;
    promptVersion: number;
    suggestions: Array<{
      id: string;
      prompt: string;
      label: string;
      category: string;
      tables: string[];
      rationale: string;
    }>;
    createdAt: string;
    updatedAt: string;
  }>();

  const keyFor = (params: {
    projectId: string;
    schemaFingerprint: string;
    modelId: string;
    promptVersion: number;
  }) => `${params.projectId}:${params.schemaFingerprint}:${params.modelId}:${params.promptVersion}`;

  return {
    get: vi.fn(async (params) => entries.get(keyFor(params)) ?? null),
    put: vi.fn(async (entry) => {
      const now = new Date().toISOString();
      const key = keyFor(entry);
      const next = {
        suggestionSetId: entries.get(key)?.suggestionSetId ?? `${entries.size + 1}`,
        ...entry,
        createdAt: entries.get(key)?.createdAt ?? now,
        updatedAt: now
      };
      entries.set(key, next);
      return next;
    }),
    clear: vi.fn(async () => {
      entries.clear();
    })
  };
}

function createClient(response: string): LlmClient {
  return {
    complete: vi.fn(async () => response),
    stream: vi.fn(async () => '')
  };
}

const SUCCESS_RESPONSE = JSON.stringify({
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
    },
    {
      prompt: 'List weekly order revenue and order count for the last 8 weeks.',
      label: 'Weekly revenue and volume',
      category: 'trend',
      tables: ['orders'],
      rationale: 'Uses order_date and order_total.'
    },
    {
      prompt: 'Break down revenue by customer region for the latest quarter.',
      label: 'Revenue by region',
      category: 'summary',
      tables: ['orders', 'customers'],
      rationale: 'Combines revenue and geography.'
    },
    {
      prompt: 'Find customers with falling order counts but rising average order value month over month.',
      label: 'Volume down AOV up',
      category: 'exceptions',
      tables: ['orders', 'customers'],
      rationale: 'Surfaces changing behavior over time.'
    },
    {
      prompt: 'Show the top 20 customers by revenue in the most recent 90 days.',
      label: 'Top customers by revenue',
      category: 'top_n',
      tables: ['orders', 'customers'],
      rationale: 'Ranks recent revenue by customer.'
    },
    {
      prompt: 'Summarize average revenue per customer segment by month.',
      label: 'Average revenue by segment',
      category: 'trend',
      tables: ['orders', 'customers'],
      rationale: 'Combines monthly aggregation with segments.'
    },
    {
      prompt: 'Identify regions with the biggest month over month revenue drop.',
      label: 'Largest regional drop',
      category: 'exceptions',
      tables: ['orders', 'customers'],
      rationale: 'Highlights negative trend outliers.'
    },
    {
      prompt: 'Show how order totals are distributed by customer segment.',
      label: 'Order total distribution',
      category: 'distribution',
      tables: ['orders', 'customers'],
      rationale: 'Uses revenue metric with segmentation.'
    },
    {
      prompt: 'Compare current quarter revenue against the previous quarter by region.',
      label: 'Quarter over quarter by region',
      category: 'trend',
      tables: ['orders', 'customers'],
      rationale: 'Supports quarter comparisons.'
    }
  ]
});

describe('nlSuggestions service', () => {
  it('regenerates schema-aware suggestions and includes inferred relationship hints in the prompt', async () => {
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
    const suggestionRepository = createSuggestionRepository();
    const client = createClient(SUCCESS_RESPONSE);

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      suggestionRepository,
      getClient: () => client
    });

    const result = await service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });

    expect(result.cached).toBe(false);
    expect(result.suggestions).toHaveLength(4);

    const request = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as LlmRequest;
    expect(request.messages[1]?.content).toContain('orders');
    expect(request.messages[1]?.content).toContain('customers');
    expect(request.messages[1]?.content).toContain('orders.customer_id -> customers.id');
  });

  it('retrieves precomputed suggestions without calling the model again', async () => {
    const repository = createDatasetRepository([buildDataset()]);
    const suggestionRepository = createSuggestionRepository();
    const client = createClient(SUCCESS_RESPONSE);

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      suggestionRepository,
      getClient: () => client
    });

    await service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });
    const second = await service.getSuggestions({ projectId: 'project-1', limit: 4 });

    expect(second.cached).toBe(true);
    expect(second.suggestions).toHaveLength(4);
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('treats row count changes as the same schema fingerprint', async () => {
    const repository = createDatasetRepository([buildDataset({ nRows: 1200 })]);
    const suggestionRepository = createSuggestionRepository();
    const client = createClient(SUCCESS_RESPONSE);

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      suggestionRepository,
      getClient: () => client
    });

    await service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });

    (repository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildDataset({ nRows: 9999 })
    ]);

    const second = await service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });

    expect(second.cached).toBe(true);
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('treats column reorder as the same schema fingerprint', async () => {
    const repository = createDatasetRepository([buildDataset()]);
    const suggestionRepository = createSuggestionRepository();
    const client = createClient(SUCCESS_RESPONSE);

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      suggestionRepository,
      getClient: () => client
    });

    await service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });

    (repository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildDataset({
        columns: [
          { name: 'order_date', dtype: 'date', nullCount: 0 },
          { name: 'order_total', dtype: 'float', nullCount: 0 },
          { name: 'customer_id', dtype: 'integer', nullCount: 0 },
          { name: 'order_id', dtype: 'integer', nullCount: 0 }
        ]
      })
    ]);

    const second = await service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });

    expect(second.cached).toBe(true);
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('regenerates when the schema changes', async () => {
    const repository = createDatasetRepository([buildDataset()]);
    const suggestionRepository = createSuggestionRepository();
    const client = createClient(SUCCESS_RESPONSE);

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      suggestionRepository,
      getClient: () => client
    });

    await service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });

    (repository.listByProject as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildDataset({
        columns: [
          { name: 'order_id', dtype: 'integer', nullCount: 0 },
          { name: 'customer_id', dtype: 'integer', nullCount: 0 },
          { name: 'order_total', dtype: 'float', nullCount: 0 },
          { name: 'order_date', dtype: 'date', nullCount: 0 },
          { name: 'status', dtype: 'string', nullCount: 0 }
        ]
      })
    ]);

    const second = await service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });

    expect(second.cached).toBe(false);
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('shares one model call across concurrent identical regenerations', async () => {
    const repository = createDatasetRepository([buildDataset()]);
    const suggestionRepository = createSuggestionRepository();
    let resolveResponse: ((value: string) => void) | null = null;
    const completeFn = vi.fn(() => new Promise<string>((resolve) => {
      resolveResponse = resolve;
    }));
    const client: LlmClient = {
      complete: completeFn,
      stream: vi.fn(async () => '')
    };

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      suggestionRepository,
      getClient: () => client
    });

    const first = service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });
    const second = service.regenerateSuggestions({ projectId: 'project-1', limit: 4 });
    await vi.waitFor(() => {
      expect(completeFn).toHaveBeenCalledTimes(1);
    });
    expect(resolveResponse).not.toBeNull();
    if (resolveResponse) {
      const finishResponse = resolveResponse as (value: string) => void;
      finishResponse(SUCCESS_RESPONSE);
    }

    await Promise.all([first, second]);

    expect(completeFn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and then succeeds', async () => {
    const repository = createDatasetRepository([buildDataset({ projectId: 'project-retry' })]);
    const suggestionRepository = createSuggestionRepository();
    let callCount = 0;
    const completeFn = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('Request timed out');
      }
      return SUCCESS_RESPONSE;
    });
    const client: LlmClient = {
      complete: completeFn,
      stream: vi.fn(async () => '')
    };

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      suggestionRepository,
      getClient: () => client
    });

    const result = await service.regenerateSuggestions({ projectId: 'project-retry', limit: 4 });

    expect(result.suggestions).toHaveLength(4);
    expect(completeFn).toHaveBeenCalledTimes(2);
  });

  it('does not retry deterministic parse failures', async () => {
    const repository = createDatasetRepository([buildDataset({ projectId: 'project-parse' })]);
    const suggestionRepository = createSuggestionRepository();
    const completeFn = vi.fn().mockResolvedValue('not valid json');
    const client: LlmClient = {
      complete: completeFn,
      stream: vi.fn(async () => '')
    };

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      suggestionRepository,
      getClient: () => client
    });

    await expect(
      service.regenerateSuggestions({ projectId: 'project-parse', limit: 4 })
    ).rejects.toThrow();
    expect(completeFn).toHaveBeenCalledTimes(1);
  });

  it('returns empty suggestions when no project datasets are available', async () => {
    const repository = createDatasetRepository([]);
    const suggestionRepository = createSuggestionRepository();
    const client = createClient(SUCCESS_RESPONSE);

    const service = createNlSuggestionsService({
      datasetRepository: repository,
      suggestionRepository,
      getClient: () => client
    });

    await expect(service.getSuggestions({ projectId: 'project-1' })).resolves.toEqual({
      suggestions: [],
      cached: false,
      schemaFingerprint: ''
    });
  });
});
