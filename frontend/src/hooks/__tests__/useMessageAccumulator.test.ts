import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMessageAccumulator } from '@/hooks/useMessageAccumulator';
import type { ChatMessage } from '@/types/llmUi';

afterEach(() => {
  localStorage.clear();
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
});
