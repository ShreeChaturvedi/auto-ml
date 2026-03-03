import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgressiveMessageText } from '../ProgressiveMessageText';

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

  it('renders plain streaming text, then swaps to final renderer', () => {
    const text = '# Streamed plan';
    const { container, rerender } = render(
      <ProgressiveMessageText
        messageId="msg-1"
        text={text}
        isLive
        animateOnMount
        renderFinal={(fullText) => <h1>{fullText}</h1>}
      />
    );

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(container.querySelectorAll('.llm-char-enter').length).toBe(0);

    act(() => {
      vi.advanceTimersByTime(64);
    });
    expect(container.querySelectorAll('.llm-char-enter').length).toBeGreaterThan(0);

    rerender(
      <ProgressiveMessageText
        messageId="msg-1"
        text={text}
        isLive={false}
        animateOnMount
        renderFinal={(fullText) => <h1>{fullText}</h1>}
      />
    );

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(text);
  });

  it('animates one-shot non-hydrated messages on mount', () => {
    const text = 'one-shot response';
    const { container } = render(
      <ProgressiveMessageText
        messageId="msg-2"
        text={text}
        isLive={false}
        animateOnMount
        renderFinal={(fullText) => <div data-testid="final">{fullText}</div>}
      />
    );

    expect(screen.queryByTestId('final')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.llm-char-enter').length).toBe(0);

    act(() => {
      vi.advanceTimersByTime(48);
    });
    expect(container.querySelectorAll('.llm-char-enter').length).toBeGreaterThan(0);
  });

  it('skips initial animation for hydrated historical messages', () => {
    const text = 'hydrated text';
    render(
      <ProgressiveMessageText
        messageId="msg-3"
        text={text}
        isLive={false}
        animateOnMount={false}
        renderFinal={(fullText) => <div data-testid="final">{fullText}</div>}
      />
    );

    expect(screen.getByTestId('final')).toHaveTextContent(text);
  });

  it('waits for catch-up completion before final renderer appears', () => {
    const text = 'x'.repeat(500);
    const { rerender } = render(
      <ProgressiveMessageText
        messageId="msg-4"
        text={text}
        isLive
        animateOnMount
        renderFinal={(fullText) => <div data-testid="final">{fullText}</div>}
      />
    );

    act(() => {
      vi.advanceTimersByTime(80);
    });
    rerender(
      <ProgressiveMessageText
        messageId="msg-4"
        text={text}
        isLive={false}
        animateOnMount
        renderFinal={(fullText) => <div data-testid="final">{fullText}</div>}
      />
    );

    expect(screen.queryByTestId('final')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByTestId('final')).toHaveTextContent(text);
  });
});
