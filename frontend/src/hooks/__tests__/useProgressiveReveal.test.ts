import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProgressiveReveal } from '../useProgressiveReveal';
import { setupRafAnimationClock, teardownRafAnimationClock } from '@/test/rafAnimationTestUtils';

describe('useProgressiveReveal', () => {
  let cancelSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ({ cancelSpy } = setupRafAnimationClock());
  });

  afterEach(() => {
    teardownRafAnimationClock();
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

  it('switches to immediate reveal when reduced motion is enabled mid-stream', () => {
    const text = 'T'.repeat(220);
    const { result, rerender } = renderHook(
      ({ prefersReducedMotion }: { prefersReducedMotion: boolean }) =>
        useProgressiveReveal({
          text,
          isLive: true,
          animateOnMount: true,
          prefersReducedMotion,
        }),
      { initialProps: { prefersReducedMotion: false } }
    );

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(result.current.visibleCharCount).toBeGreaterThan(0);
    expect(result.current.visibleCharCount).toBeLessThan(text.length);

    rerender({ prefersReducedMotion: true });

    expect(result.current.visibleText).toBe(text);
    expect(result.current.visibleCharCount).toBe(text.length);
    expect(result.current.isFullyRevealed).toBe(true);
  });

  it('clamps visible count and text when source text shrinks', () => {
    const { result, rerender } = renderHook(
      ({ text, isLive }: { text: string; isLive: boolean }) =>
        useProgressiveReveal({
          text,
          isLive,
          animateOnMount: true,
          prefersReducedMotion: false,
        }),
      {
        initialProps: { text: 'abcdefghijklmnopqrstuv', isLive: true },
      }
    );

    act(() => {
      vi.advanceTimersByTime(420);
    });
    expect(result.current.visibleCharCount).toBeGreaterThan(5);

    rerender({ text: 'abc', isLive: false });

    expect(result.current.visibleCharCount).toBeLessThanOrEqual(3);
    expect(result.current.visibleText.length).toBeLessThanOrEqual(3);
    expect(result.current.visibleText).toBe('abc');
  });

  it('cancels queued animation frame on unmount', () => {
    const { unmount } = renderHook(() =>
      useProgressiveReveal({
        text: 'Unmount cleanup check',
        isLive: true,
        animateOnMount: true,
        prefersReducedMotion: false,
      })
    );

    unmount();
    expect(cancelSpy).toHaveBeenCalled();
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
