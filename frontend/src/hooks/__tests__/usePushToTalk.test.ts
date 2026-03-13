import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePushToTalk } from '@/hooks/usePushToTalk';

function createKeyEvent(key: string) {
  return {
    key,
    repeat: false,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLDivElement>;
}

describe('usePushToTalk', () => {
  it('stops recording when space is released during connecting', () => {
    vi.useFakeTimers();

    const startRecording = vi.fn();
    const stopRecording = vi.fn();
    const restoreInput = vi.fn();

    const { result, rerender } = renderHook(
      ({ voiceState }) => usePushToTalk({
        voiceState,
        getInputSnapshot: () => ({ value: 'Draft prompt', cursor: 12 }),
        restoreInput,
        startRecording,
        stopRecording,
      }),
      {
        initialProps: {
          voiceState: 'idle' as const,
        },
      }
    );

    act(() => {
      result.current.handleKeyDown(createKeyEvent(' '));
      vi.advanceTimersByTime(400);
    });

    expect(restoreInput).toHaveBeenCalledWith({ value: 'Draft prompt', cursor: 12 });
    expect(startRecording).toHaveBeenCalledTimes(1);

    rerender({ voiceState: 'connecting' });

    const keyUpEvent = createKeyEvent(' ');
    const handled = result.current.handleKeyUp(keyUpEvent);

    expect(handled).toBe(true);
    expect(stopRecording).toHaveBeenCalledTimes(1);
  });
});
