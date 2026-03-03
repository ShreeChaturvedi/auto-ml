import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThinkingBlock } from '../ThinkingBlock';

describe('ThinkingBlock', () => {
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

  it('progressively reveals expanded thinking content while live', () => {
    const content = 'x'.repeat(240);
    const { container } = render(
      <ThinkingBlock
        messageId="thinking-1"
        content={content}
        isComplete={false}
        isLive
        animateOnMount
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Thinking for/i }));
    expect(screen.queryByText(content)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(80);
    });

    const renderedChars = container.querySelectorAll('.llm-char-enter').length;
    expect(renderedChars).toBeGreaterThan(0);
    expect(renderedChars).toBeLessThan(content.length);
  });

  it('switches to final markdown rendering when thinking completes', () => {
    const content = '# Final Thought';
    const { rerender } = render(
      <ThinkingBlock
        messageId="thinking-2"
        content={content}
        isComplete={false}
        isLive
        animateOnMount
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Thinking for/i }));
    expect(screen.queryByRole('heading', { level: 1, name: 'Final Thought' })).not.toBeInTheDocument();

    rerender(
      <ThinkingBlock
        messageId="thinking-2"
        content={content}
        isComplete
        isLive={false}
        animateOnMount
      />
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Final Thought' })).toBeInTheDocument();
  });
});
