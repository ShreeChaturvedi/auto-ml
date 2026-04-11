import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMessageAccumulator } from '@/hooks/useMessageAccumulator';
import { hydrateStoredMessages, persistStoredMessages } from '@/hooks/agenticLoopStorage';
import type { ChatMessage } from '@/types/llmUi';

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

describe('useMessageAccumulator', () => {
  it('hydrates stored messages on mount and calls onHydrate once', () => {
    const stored = {
      version: 2,
      messages: [
        { id: 'msg-1', type: 'assistant_text', content: 'Hello' }
      ],
      savepoints: {}
    };
    localStorage.setItem('key-proj', JSON.stringify(stored));

    const onHydrate = vi.fn();

    const { result } = renderHook(() => useMessageAccumulator({
      storageKey: 'key',
      projectId: 'proj',
      onHydrate
    }));

    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'msg-1', content: 'Hello' })
    ]);
  });

  it('does not re-fire hydration when onHydrate is referentially stable across re-renders', () => {
    const onHydrate = vi.fn();

    const { rerender } = renderHook(() => useMessageAccumulator({
      storageKey: 'stable-key',
      projectId: 'proj',
      onHydrate
    }));

    expect(onHydrate).toHaveBeenCalledTimes(1);

    rerender();
    rerender();

    // onHydrate must NOT be called again — the effect deps (messageStorageScope,
    // sessionVersion, onHydrate) are all stable so the effect should not re-run.
    expect(onHydrate).toHaveBeenCalledTimes(1);
  });

  it('re-fires hydration when an unstable onHydrate causes the effect to re-run', () => {
    // This test documents the behavior when onHydrate is NOT memoized by the
    // caller — each render creates a new function reference, which triggers the
    // hydration effect. The fix for the infinite re-render bug was to ensure
    // callers pass a stable callback, but this test guards the boundary.
    let callCount = 0;

    const { rerender } = renderHook(
      ({ cb }: { cb: (msgs: ChatMessage[], ids: Set<string>, sp: Record<number, string>) => void }) =>
        useMessageAccumulator({
          storageKey: 'unstable-key',
          projectId: 'proj',
          onHydrate: cb
        }),
      { initialProps: { cb: () => { callCount++; } } }
    );

    const countAfterMount = callCount;
    expect(countAfterMount).toBeGreaterThanOrEqual(1);

    // Re-render with a NEW function reference
    rerender({ cb: () => { callCount++; } });

    // The effect will re-fire because onHydrate changed
    expect(callCount).toBeGreaterThan(countAfterMount);
  });

  it('resets accumulator state and clears localStorage', () => {
    localStorage.setItem('reset-proj', JSON.stringify({
      version: 2,
      messages: [{ id: 'm1', type: 'user', content: 'test' }],
      savepoints: { 0: 'sp-1' }
    }));

    const { result } = renderHook(() => useMessageAccumulator({
      storageKey: 'reset',
      projectId: 'proj'
    }));

    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.resetAccumulator();
    });

    expect(result.current.messages).toEqual([]);
    expect(localStorage.getItem('reset-proj')).toBeNull();
  });

  it('swallows localStorage persistence failures instead of throwing into the phase boundary', () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useMessageAccumulator({
      storageKey: 'quota-key',
      projectId: 'proj'
    }));

    act(() => {
      result.current.setMessages([
        { id: 'user-1', type: 'user', content: 'hello', timestamp: Date.now() },
        {
          id: 'tool-1',
          type: 'tool_call',
          call: {
            id: 'call-1',
            tool: 'get_dataset_profile',
            args: { datasetId: 'ds-1', large: 'x'.repeat(12000) }
          },
          result: {
            id: 'call-1',
            tool: 'get_dataset_profile',
            output: {
              sample: Array.from({ length: 200 }, (_, index) => ({ index, value: 'y'.repeat(200) }))
            }
          }
        }
      ]);
    });

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[agenticLoopStorage] Failed to persist chat transcript',
      expect.objectContaining({
        messageStorageScope: 'quota-key-proj',
        messageCount: 2
      })
    );

    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('preserves feature suggestion UI items when compacting stored messages', () => {
    const uiMessage: ChatMessage = {
      id: 'ui-features',
      type: 'ui',
      schema: {
        version: '1',
        kind: 'feature_engineering',
        sections: [{
          id: 'proposals',
          title: 'Feature Proposals',
          items: [{
            type: 'feature_suggestion',
            id: 'feat-api-calls',
            feature: {
              sourceColumn: 'api_calls',
              featureName: 'api_calls_log1p',
              description: 'Compress heavy API call outliers before model training.',
              method: 'log1p_transform',
              params: {}
            },
            rationale: 'Compress heavy API call outliers before model training.',
            impact: 'high'
          }]
        }]
      }
    };

    persistStoredMessages('feature-storage', [uiMessage]);

    const raw = localStorage.getItem('feature-storage');
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('[truncated]');

    const hydrated = hydrateStoredMessages('feature-storage');
    const hydratedMessage = hydrated.messages[0] as Extract<ChatMessage, { type: 'ui' }>;
    const item = hydratedMessage.schema.sections[0].items[0];

    expect(item).toMatchObject({
      type: 'feature_suggestion',
      id: 'feat-api-calls',
      rationale: 'Compress heavy API call outliers before model training.',
      feature: {
        sourceColumn: 'api_calls',
        featureName: 'api_calls_log1p',
        description: 'Compress heavy API call outliers before model training.'
      }
    });
  });

  it('drops corrupted persisted UI messages instead of hydrating invalid card items', () => {
    localStorage.setItem('corrupt-feature-storage', JSON.stringify({
      version: 2,
      messages: [{
        id: 'ui-corrupt',
        type: 'ui',
        schema: {
          version: '1',
          kind: 'feature_engineering',
          sections: [{
            id: 'proposals',
            items: ['[truncated]']
          }]
        }
      }],
      savepoints: {}
    }));

    const hydrated = hydrateStoredMessages('corrupt-feature-storage');

    expect(hydrated.messages).toEqual([]);
    expect(hydrated.hydratedMessageIds.size).toBe(0);
  });
});
