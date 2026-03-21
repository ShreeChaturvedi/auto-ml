import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNlSuggestionStore } from '../nlSuggestionStore';

const { mockFetchNlSuggestions } = vi.hoisted(() => ({
  mockFetchNlSuggestions: vi.fn().mockResolvedValue({
    suggestions: [
      {
        id: 'suggestion-1',
        prompt: 'Compare weekly revenue and average order value over the last 8 weeks.',
        label: 'Weekly revenue trends',
        category: 'trend',
        tables: ['orders'],
        rationale: 'Uses time and revenue metrics.'
      }
    ],
    cached: true,
    schemaFingerprint: 'schema-1'
  })
}));

vi.mock('@/lib/api/query', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/query')>('@/lib/api/query');
  return {
    ...actual,
    fetchNlSuggestions: mockFetchNlSuggestions
  };
});

describe('nlSuggestionStore', () => {
  beforeEach(() => {
    mockFetchNlSuggestions.mockClear();
    useNlSuggestionStore.getState().reset();
  });

  it('caches project suggestions after the first fetch', async () => {
    const first = await useNlSuggestionStore.getState().fetchProjectSuggestions('project-1');
    const second = await useNlSuggestionStore.getState().fetchProjectSuggestions('project-1');

    expect(first?.suggestions).toHaveLength(1);
    expect(second?.suggestions).toHaveLength(1);
    expect(mockFetchNlSuggestions).toHaveBeenCalledTimes(1);
    expect(mockFetchNlSuggestions).toHaveBeenCalledWith('project-1', 8);
  });

  it('deduplicates concurrent fetches for the same project', async () => {
    await Promise.all([
      useNlSuggestionStore.getState().fetchProjectSuggestions('project-1'),
      useNlSuggestionStore.getState().fetchProjectSuggestions('project-1')
    ]);

    expect(mockFetchNlSuggestions).toHaveBeenCalledTimes(1);
  });

  it('refetches when forced', async () => {
    await useNlSuggestionStore.getState().fetchProjectSuggestions('project-1');
    await useNlSuggestionStore.getState().fetchProjectSuggestions('project-1', { force: true });

    expect(mockFetchNlSuggestions).toHaveBeenCalledTimes(2);
  });
});
