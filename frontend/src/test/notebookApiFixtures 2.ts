import { vi } from 'vitest';

export type MockNotebookFixture = {
  notebookId: string;
  kind?: 'phase' | 'standalone';
  metadata?: Record<string, unknown>;
  name?: string;
};

export type NotebookApiMocks = {
  notebooks: MockNotebookFixture[];
  listNotebooks: ReturnType<typeof vi.fn>;
  createNotebook: ReturnType<typeof vi.fn>;
  updateNotebook: ReturnType<typeof vi.fn>;
};

/**
 * Shared vitest mock factory for `@/lib/api/notebooks` sync-hook tests.
 * Returns a plain object with vi.fn stubs and a mutable `notebooks` array.
 *
 * Because Vitest hoists `vi.hoisted` callbacks above static imports, the
 * synchronous form (`vi.hoisted(() => createNotebookApiMocks())`) will hit
 * a TDZ error. Use the async dynamic-import form instead:
 *
 *   const notebookApiMocks = await vi.hoisted(async () => {
 *     const { createNotebookApiMocks } = await import('@/test/notebookApiFixtures');
 *     return createNotebookApiMocks();
 *   });
 */
export function createNotebookApiMocks(): NotebookApiMocks {
  return {
    notebooks: [],
    listNotebooks: vi.fn(async () => [] as MockNotebookFixture[]),
    createNotebook: vi.fn(async () => ({
      notebookId: 'created-nb',
      kind: 'phase' as const,
      metadata: {}
    })),
    updateNotebook: vi.fn(async () => ({
      notebookId: 'created-nb',
      kind: 'phase' as const,
      metadata: {}
    }))
  };
}
