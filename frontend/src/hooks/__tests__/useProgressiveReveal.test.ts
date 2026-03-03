import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProgressiveReveal } from '../useProgressiveReveal';

describe('useProgressiveReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      return window.setTimeout(() => callback(performance.now()), 16);
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      window.clearTimeout(id);
    });
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reveals text progressively over time', () => {
    const text = 'streamed response text';
    const { result } = renderHook(() => useProgressiveReveal({
      text,
      isLive: true,
      animateOnMount: true,
      prefersReducedMotion: false
    }));

    expect(result.current.visibleText).toBe('');
    expect(result.current.isRevealing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(result.current.visibleText.length).toBeGreaterThan(0);
    expect(result.current.visibleText.length).toBeLessThan(text.length);
  });

  it('increases reveal throughput when backlog is large', () => {
    const text = 'x'.repeat(600);
    const { result } = renderHook(() => useProgressiveReveal({
      text,
      isLive: true,
      animateOnMount: true,
      prefersReducedMotion: false
    }));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.visibleText.length).toBeGreaterThan(40);
  });

  it('enters catch-up mode when live streaming ends before fully revealed', () => {
    const text = 'y'.repeat(300);
    const { result, rerender } = renderHook(
      ({ live }) => useProgressiveReveal({
        text,
        isLive: live,
        animateOnMount: true,
        prefersReducedMotion: false
      }),
      { initialProps: { live: true } }
    );

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(result.current.visibleText.length).toBeGreaterThan(0);
    expect(result.current.visibleText.length).toBeLessThan(text.length);

    rerender({ live: false });
    expect(result.current.isCatchup).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.visibleText).toBe(text);
    expect(result.current.isFullyRevealed).toBe(true);
    expect(result.current.isCatchup).toBe(false);
  });

  it('reveals immediately when reduced motion is preferred', () => {
    const text = 'no animation please';
    const { result } = renderHook(() => useProgressiveReveal({
      text,
      isLive: true,
      animateOnMount: true,
      prefersReducedMotion: true
    }));

    expect(result.current.visibleText).toBe(text);
    expect(result.current.isFullyRevealed).toBe(true);
  });

  it('handles empty and non-animated historical text safely', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useProgressiveReveal({
        text,
        isLive: false,
        animateOnMount: false,
        prefersReducedMotion: false
      }),
      { initialProps: { text: '' } }
    );

    expect(result.current.visibleText).toBe('');
    expect(result.current.isFullyRevealed).toBe(true);

    rerender({ text: 'restored message' });

    expect(result.current.visibleText).toBe('restored message');
    expect(result.current.isRevealing).toBe(false);
  });
});
