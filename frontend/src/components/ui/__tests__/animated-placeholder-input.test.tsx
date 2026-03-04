import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimatedPlaceholderInput } from '../animated-placeholder-input';

describe('AnimatedPlaceholderInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      return window.setTimeout(() => callback(performance.now()), 0);
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

  it('hides animated placeholder overlay for numeric controlled values', () => {
    const { container } = render(
      <AnimatedPlaceholderInput placeholders={['numpy', 'pandas']} value={0} onChange={() => {}} />
    );

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('keeps character spans mounted until long stagger animation is complete', () => {
    const { container } = render(
      <AnimatedPlaceholderInput
        placeholders={['a', 'abcdefghijklmnop']}
        interval={500}
        onChange={() => {}}
      />
    );

    const queryAnimatedChars = () =>
      container.querySelectorAll('span[style*="placeholder-char-in"]');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(queryAnimatedChars().length).toBe(16);

    // t=1180ms total (still before the dynamic reset timeout for 16 chars).
    act(() => {
      vi.advanceTimersByTime(680);
    });
    expect(queryAnimatedChars().length).toBeGreaterThan(0);

    // t=1300ms total (past reset timeout), char spans should be unmounted.
    act(() => {
      vi.advanceTimersByTime(120);
      vi.advanceTimersByTime(1);
    });
    expect(queryAnimatedChars().length).toBe(0);
  });
});
