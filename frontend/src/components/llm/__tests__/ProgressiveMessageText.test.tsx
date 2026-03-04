import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgressiveMessageText } from '../ProgressiveMessageText';

vi.mock('@/components/llm/streamdown/StreamdownMessage', () => ({
  StreamdownMessage: ({
    text,
    isAnimating,
    showCaret,
  }: {
    text: string;
    isAnimating: boolean;
    showCaret?: boolean;
  }) => (
    <div>
      <div data-testid="streamdown-message" data-animating={String(isAnimating)}>
        {text}
      </div>
      {showCaret ? <span data-testid="streamdown-caret" /> : null}
    </div>
  ),
}));

describe('ProgressiveMessageText', () => {
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

  it('reveals plain text progressively instead of all at once', () => {
    const text = 'streamed response';
    const { container } = render(
      <ProgressiveMessageText
        messageId="m1"
        text={text}
        isLive
        mode="plain"
        animateOnMount
        className="whitespace-pre-wrap"
      />
    );

    expect(screen.queryByText(text)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(96);
    });

    const animatedChars = container.querySelectorAll('.llm-char-enter');
    expect(animatedChars.length).toBeGreaterThan(0);
    expect(animatedChars.length).toBeLessThan(text.length);
  });

  it('renders markdown progressively while live and keeps caret visible', () => {
    render(
      <ProgressiveMessageText
        messageId="m2"
        text="**Bold** markdown"
        isLive
        mode="markdown"
        animateOnMount
        className="prose"
      />
    );

    act(() => {
      vi.advanceTimersByTime(120);
    });

    const streamdown = screen.getByTestId('streamdown-message');
    expect(streamdown).toHaveTextContent(/\*\*B?/);
    expect(streamdown.getAttribute('data-animating')).toBe('true');
    expect(screen.getByTestId('streamdown-caret')).toBeInTheDocument();
  });

  it('switches markdown to catch-up animation after live stream stops', () => {
    const text = '# Final Plan Heading';
    const { rerender } = render(
      <ProgressiveMessageText
        messageId="m3"
        text={text}
        isLive
        mode="markdown"
        animateOnMount
      />
    );

    rerender(
      <ProgressiveMessageText
        messageId="m3"
        text={text}
        isLive={false}
        mode="markdown"
        animateOnMount
      />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const streamdown = screen.getByTestId('streamdown-message');
    expect(streamdown).toHaveTextContent(text);
    expect(streamdown.getAttribute('data-animating')).toBe('false');
    expect(screen.queryByTestId('streamdown-caret')).not.toBeInTheDocument();
  });

  it('renders full text immediately for hydrated non-live messages', () => {
    const { container } = render(
      <ProgressiveMessageText
        messageId="m-hydrated"
        text="Hydrated full text"
        isLive={false}
        mode="plain"
        animateOnMount={false}
        className="plain"
      />
    );

    expect(screen.getByText('Hydrated full text')).toBeInTheDocument();
    expect(container.querySelectorAll('.llm-char-enter')).toHaveLength(0);
  });
});
