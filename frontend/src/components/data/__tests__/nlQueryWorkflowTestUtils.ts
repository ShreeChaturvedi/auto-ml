import { act } from '@testing-library/react';
import type { RefObject } from 'react';
import { vi } from 'vitest';

import type { NlQueryWorkflowHandle } from '../NlQueryWorkflow';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';

export const MOCK_RESULT: NlGenerationResult = {
  sql: 'SELECT id, name FROM users LIMIT 10;',
  rationale: 'Returns the first 10 users by primary key.',
  explanation: {
    intentSummary: 'Return first users by primary key.',
    selectedTables: ['users'],
    joinPlan: [],
    filters: [],
    aggregations: [],
    assumptions: [],
    validationNotes: [],
    confidence: 0.91,
    warningLevel: 'none',
    confidenceMode: 'model',
    reliabilityTier: 'high'
  },
  queryId: 'test-query-123',
  provider: {
    id: 'openai',
    label: 'OpenAI',
    model: 'gpt-5.4'
  },
  cached: false,
  queryResult: {
    queryId: 'test-query-123',
    sql: 'SELECT id, name FROM users LIMIT 10;',
    columns: [
      { name: 'id', dataTypeID: 23 },
      { name: 'name', dataTypeID: 25 }
    ],
    rows: [{ id: 1, name: 'Alice' }],
    rowCount: 1,
    executionMs: 42,
    cached: false
  }
};

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function buildProps(
  overrides: Partial<{
    projectId: string | null;
    englishQuery: string;
    onQueryChange: (value: string) => void;
    onGenerate: (
      query: string,
      onStreamEvent?: (event: NlQueryStreamEvent) => void,
      signal?: AbortSignal
    ) => Promise<NlGenerationResult>;
    onApprove: (result: NlGenerationResult, sql: string) => void;
    onPhaseChange: (phase: string) => void;
  }> = {}
) {
  return {
    projectId: null,
    englishQuery: 'Show me the first 10 users',
    onQueryChange: vi.fn(),
    onGenerate: vi.fn().mockResolvedValue(MOCK_RESULT),
    onApprove: vi.fn(),
    onPhaseChange: vi.fn(),
    ...overrides
  };
}

export async function triggerGenerate(handleRef: RefObject<NlQueryWorkflowHandle | null>) {
  await act(async () => {
    handleRef.current?.triggerGenerate();
    await Promise.resolve();
  });
}

export async function fastForwardReveal() {
  await act(async () => {
    vi.advanceTimersByTime(3_000);
    await Promise.resolve();
  });
}

export function installConstrainedHeightResizeObserver(height = 640) {
  const original = globalThis.ResizeObserver;

  class ResizeObserverMock {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe() {
      this.callback(
        [{ contentRect: { height } } as ResizeObserverEntry],
        this as unknown as ResizeObserver
      );
    }

    disconnect() {}

    unobserve() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

  return () => {
    globalThis.ResizeObserver = original;
  };
}
