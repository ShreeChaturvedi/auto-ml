import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgressiveMessageText } from '../ProgressiveMessageText';

describe('ProgressiveMessageText', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it('reveals live text progressively instead of all at once', () => {
    const text = 'streamed response';
    const { container } = render(
      <ProgressiveMessageText
        messageId="m1"
        text={text}
        isLive
        animateOnMount
        plainClassName="whitespace-pre-wrap"
        finalClassName="prose"
        renderFinal={(fullText) => <p>{fullText}</p>}
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

  it('switches to final render after stream ends and catch-up completes', () => {
    const text = '# Final Plan Heading';
    const { rerender } = render(
      <ProgressiveMessageText
        messageId="m1"
        text={text}
        isLive
        animateOnMount
        plainClassName="whitespace-pre-wrap"
        finalClassName="prose"
        renderFinal={(fullText) => <h2>{fullText}</h2>}
      />
    );

    rerender(
      <ProgressiveMessageText
        messageId="m1"
        text={text}
        isLive={false}
        animateOnMount
        plainClassName="whitespace-pre-wrap"
        finalClassName="prose"
        renderFinal={(fullText) => <h2>{fullText}</h2>}
      />
    );

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(text);
  });

  it('renders final content immediately for hydrated messages', () => {
    const { container } = render(
      <ProgressiveMessageText
        messageId="m-hydrated"
        text="Hydrated full text"
        isLive={false}
        animateOnMount={false}
        plainClassName="plain"
        finalClassName="final"
        renderFinal={(fullText) => <p>{fullText}</p>}
      />
    );

    expect(screen.getByText('Hydrated full text')).toBeInTheDocument();
    expect(container.querySelectorAll('.llm-char-enter')).toHaveLength(0);
  });

  it('falls back to raw text when renderFinal is omitted', () => {
    render(
      <ProgressiveMessageText
        messageId="m2"
        text="plain final"
        isLive={false}
        animateOnMount={false}
      />
    );

    expect(screen.getByText('plain final')).toBeInTheDocument();
  });
});
