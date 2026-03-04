import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThinkingBlock } from '../ThinkingBlock';

describe('ThinkingBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it('renders markdown progressively while live thinking is streaming', () => {
    render(
      <ThinkingBlock
        messageId="thinking-1"
        content="**Bold** and `code`"
        isComplete={false}
        isLive
        animateOnMount
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Thinking for/i }));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText('Bold', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('code', { selector: 'code' })).toBeInTheDocument();
  });
});
