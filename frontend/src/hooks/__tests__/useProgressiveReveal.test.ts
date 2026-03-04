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

  it('progressively reveals text over time', () => {
    const { result } = renderHook(() =>
      useProgressiveReveal({
        text: 'Progressive output text',
        isLive: true,
        animateOnMount: true,
        prefersReducedMotion: false,
      })
    );

    expect(result.current.visibleCharCount).toBe(0);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.visibleCharCount).toBeGreaterThan(0);
    expect(result.current.visibleCharCount).toBeLessThan('Progressive output text'.length);
    expect(result.current.isRevealing).toBe(true);
  });

  it('accelerates reveal speed under backlog', () => {
    const longText = 'A'.repeat(400);
    const { result } = renderHook(() =>
      useProgressiveReveal({
        text: longText,
        isLive: true,
        animateOnMount: true,
        prefersReducedMotion: false,
      })
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.visibleCharCount).toBeGreaterThan(40);
  });

  it('uses catch-up mode after isLive becomes false', () => {
    const text = 'B'.repeat(180);
    const { result, rerender } = renderHook(
      ({ isLive }: { isLive: boolean }) =>
        useProgressiveReveal({
          text,
          isLive,
          animateOnMount: true,
          prefersReducedMotion: false,
        }),
      {
        initialProps: { isLive: true },
      }
    );

    act(() => {
      vi.advanceTimersByTime(160);
    });

    const liveProgress = result.current.visibleCharCount;
    expect(liveProgress).toBeGreaterThan(0);

    rerender({ isLive: false });
    expect(result.current.isCatchup).toBe(true);

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(result.current.visibleCharCount).toBe(text.length);
    expect(result.current.isFullyRevealed).toBe(true);
    expect(result.current.isCatchup).toBe(false);
  });

  it('reveals immediately when reduced motion is enabled', () => {
    const text = 'Reduced motion text';
    const { result } = renderHook(() =>
      useProgressiveReveal({
        text,
        isLive: true,
        animateOnMount: true,
        prefersReducedMotion: true,
      })
    );

    expect(result.current.visibleText).toBe(text);
    expect(result.current.isFullyRevealed).toBe(true);
  });

  it('handles empty and short strings without regressions', () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProgressiveReveal({
          text,
          isLive: false,
          animateOnMount: true,
          prefersReducedMotion: false,
        }),
      {
        initialProps: { text: '' },
      }
    );

    expect(result.current.visibleText).toBe('');
    expect(result.current.isFullyRevealed).toBe(true);

    rerender({ text: 'x' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.visibleText).toBe('x');
  });
});
