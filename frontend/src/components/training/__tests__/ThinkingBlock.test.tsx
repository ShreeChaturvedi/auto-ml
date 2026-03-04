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

  it('renders rich markdown progressively while live thinking is streaming', () => {
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

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    const strongNode = document.querySelector('[data-streamdown="strong"]');
    expect(strongNode).not.toBeNull();
    expect(strongNode).toHaveTextContent('Bold');
    expect(screen.getByText('code', { selector: '[data-streamdown="inline-code"]' })).toBeInTheDocument();
    expect(document.querySelector('.katex')).not.toBeNull();
    expect(screen.getByText(/print\("hello"\)/)).toBeInTheDocument();
  });
});
