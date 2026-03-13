import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useVoiceTranscript } from '@/hooks/useVoiceTranscript';

describe('useVoiceTranscript', () => {
  it('waits for completed turns before inserting text into the actual input', () => {
    let value = '';
    let cursorOffset = 0;
    const applyValue = vi.fn((nextValue: string, nextCursorOffset: number) => {
      value = nextValue;
      cursorOffset = nextCursorOffset;
    });

    const { result } = renderHook(() => useVoiceTranscript({
      getValue: () => value,
      getCursorOffset: () => cursorOffset,
      applyValue,
    }));

    act(() => {
      result.current.startSession();
      result.current.handleTranscriptEvent({ type: 'committed', itemId: 'item-1', previousItemId: null });
      result.current.handleTranscriptEvent({ type: 'delta', itemId: 'item-1', delta: 'hel' });
      result.current.handleTranscriptEvent({ type: 'delta', itemId: 'item-1', delta: 'lo' });
    });

    expect(value).toBe('');
    expect(cursorOffset).toBe(0);

    act(() => {
      result.current.handleTranscriptEvent({
        type: 'completed',
        itemId: 'item-1',
        transcript: 'hello',
      });
    });

    expect(value).toBe('hello');
    expect(cursorOffset).toBe(5);
  });

  it('anchors dictated text at the active cursor position', () => {
    let value = 'Ask:  world';
    let cursorOffset = 5;

    const { result } = renderHook(() => useVoiceTranscript({
      getValue: () => value,
      getCursorOffset: () => cursorOffset,
      applyValue: (nextValue, nextCursorOffset) => {
        value = nextValue;
        cursorOffset = nextCursorOffset;
      },
    }));

    act(() => {
      result.current.startSession();
      result.current.handleTranscriptEvent({ type: 'committed', itemId: 'item-1', previousItemId: null });
      result.current.handleTranscriptEvent({
        type: 'completed',
        itemId: 'item-1',
        transcript: 'hello',
      });
    });

    expect(value).toBe('Ask: hello world');
    expect(cursorOffset).toBe('Ask: hello'.length);
  });

  it('orders committed chunks and removes repeated boundary words', () => {
    let value = '';
    let cursorOffset = 0;

    const { result } = renderHook(() => useVoiceTranscript({
      getValue: () => value,
      getCursorOffset: () => cursorOffset,
      applyValue: (nextValue, nextCursorOffset) => {
        value = nextValue;
        cursorOffset = nextCursorOffset;
      },
    }));

    act(() => {
      result.current.startSession();
      result.current.handleTranscriptEvent({ type: 'committed', itemId: 'item-1', previousItemId: null });
      result.current.handleTranscriptEvent({ type: 'committed', itemId: 'item-2', previousItemId: 'item-1' });
      result.current.handleTranscriptEvent({
        type: 'completed',
        itemId: 'item-2',
        transcript: 'the notebook',
      });
      result.current.handleTranscriptEvent({
        type: 'completed',
        itemId: 'item-1',
        transcript: 'open the',
      });
    });

    expect(value).toBe('open the notebook');
    expect(cursorOffset).toBe('open the notebook'.length);
  });

});
