import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertTriangle, Calendar, Keyboard, Paperclip } from 'lucide-react';

import { InsightTicker } from '../insight-ticker';
import { TipTicker, type ContextualTip } from '../contextual-tip-bar';

describe('ticker guards', () => {
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

  it('keeps rendering insight items when the list shrinks mid-cycle', () => {
    const { rerender } = render(
      <InsightTicker
        interval={10}
        items={[
          { icon: AlertTriangle, text: 'First insight', severity: 'high' },
          { icon: Calendar, text: 'Second insight', severity: 'medium' },
          { icon: Keyboard, text: 'Third insight', severity: 'low' },
        ]}
        expandable={false}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(() => {
      rerender(
        <InsightTicker
          interval={10}
          items={[
            { icon: AlertTriangle, text: 'Only remaining insight', severity: 'high' },
          ]}
          expandable={false}
        />,
      );
    }).not.toThrow();

    expect(screen.getAllByText('Only remaining insight').length).toBeGreaterThan(0);
  });

  it('keeps rendering tips when the list shrinks mid-cycle', () => {
    const initialTips: ContextualTip[] = [
      { id: 'tip-1', icon: Keyboard, content: 'First tip' },
      { id: 'tip-2', icon: Paperclip, content: 'Second tip' },
      { id: 'tip-3', icon: AlertTriangle, content: 'Third tip' },
    ];

    const { rerender } = render(
      <TipTicker tips={initialTips} interval={10} />,
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(() => {
      rerender(
        <TipTicker
          tips={[
            { id: 'tip-1', icon: Keyboard, content: 'Only remaining tip' },
          ]}
          interval={10}
        />,
      );
    }).not.toThrow();

    expect(screen.getAllByText('Only remaining tip').length).toBeGreaterThan(0);
  });
});
