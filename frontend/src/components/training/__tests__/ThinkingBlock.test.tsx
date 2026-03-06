import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThinkingBlock } from '../ThinkingBlock';
import { setupRafAnimationClock, teardownRafAnimationClock } from '@/test/rafAnimationTestUtils';

describe('ThinkingBlock', () => {
  beforeEach(() => {
    setupRafAnimationClock();
  });

  afterEach(() => {
    teardownRafAnimationClock();
  });

  it('renders rich markdown progressively while live thinking is streaming', async () => {
    render(
      <ThinkingBlock
        messageId="thinking-1"
        content={[
          '**Bold** and `code` with inline math $x^2$',
          '',
          '```python',
          'print("hello")',
          '```',
          '',
          '```mermaid',
          'graph TD',
          'A-->B',
          '```'
        ].join('\n')}
        isComplete={false}
        isLive
        animateOnMount
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Thinking for/i }));

    await act(async () => {
      vi.advanceTimersByTime(6000);
      await Promise.resolve();
    });

    const strongNode = document.querySelector('[data-streamdown="strong"]');
    expect(strongNode).not.toBeNull();
    expect(strongNode).toHaveTextContent('Bold');
    expect(screen.getByText('code', { selector: '[data-streamdown="inline-code"]' })).toBeInTheDocument();
    expect(document.querySelector('.katex')).not.toBeNull();
  });

  it('renders fenced code blocks once thinking is complete with animation disabled', () => {
    render(
      <ThinkingBlock
        messageId="thinking-complete"
        content={[
          '**Bold** and `code` with inline math $x^2$',
          '',
          '```python',
          'print("hello")',
          '```',
          '',
          '```mermaid',
          'graph TD',
          'A-->B',
          '```'
        ].join('\n')}
        isComplete
        isLive={false}
        animateOnMount={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Thought for|Thinking for/i }));

    expect(document.querySelector('[data-streamdown="code-block"]')).not.toBeNull();
  });

  it('locks the displayed timer once thinking is complete', async () => {
    const { rerender } = render(
      <ThinkingBlock
        messageId="thinking-timer"
        content="simple thought"
        isComplete={false}
        isLive
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(2300);
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: /Thinking for 2s/i })).toBeInTheDocument();

    rerender(
      <ThinkingBlock
        messageId="thinking-timer"
        content="simple thought"
        isComplete
        isLive={false}
      />
    );
    expect(screen.getByRole('button', { name: /Thought for 2s/i })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: /Thought for 2s/i })).toBeInTheDocument();
  });

  it('disables expansion when there is no thinking content', () => {
    render(
      <ThinkingBlock
        messageId="thinking-empty"
        content=""
        isComplete={false}
        isLive
      />
    );

    const button = screen.getByRole('button', { name: /Thinking for/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(document.querySelector('.llm-thinking-markdown')).toBeNull();
  });
});
