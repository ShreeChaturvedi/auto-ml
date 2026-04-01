import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  usePushToTalkMock,
  useVoiceInputMock,
  useVoiceTranscriptMock,
} = vi.hoisted(() => ({
  usePushToTalkMock: vi.fn(),
  useVoiceInputMock: vi.fn(),
  useVoiceTranscriptMock: vi.fn(),
}));

vi.mock('@/hooks/usePushToTalk', () => ({
  usePushToTalk: usePushToTalkMock,
}));

vi.mock('@/hooks/useVoiceInput', () => ({
  useVoiceInput: useVoiceInputMock,
}));

vi.mock('@/hooks/useVoiceTranscript', () => ({
  useVoiceTranscript: useVoiceTranscriptMock,
}));

import { useComposerVoiceInput } from '@/hooks/useComposerVoiceInput';

describe('useComposerVoiceInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bridges transcript updates through a minimal composer surface', () => {
    const composer = {
      focus: vi.fn(),
      getSelectionOffset: vi.fn(() => 4),
      syncValue: vi.fn(),
    };
    const onValueChange = vi.fn();

    const transcriptBridge = {
      handleTranscriptEvent: vi.fn(),
      startSession: vi.fn(),
      stopSession: vi.fn(),
    };

    let transcriptOptions:
      | {
          getValue: () => string;
          getCursorOffset: () => number;
          applyValue: (value: string, cursorOffset: number, animateRange?: { start: number; end: number }) => void;
        }
      | undefined;

    useVoiceTranscriptMock.mockImplementation((options) => {
      transcriptOptions = options;
      return transcriptBridge;
    });

    useVoiceInputMock.mockReturnValue({
      state: 'idle',
      analyserRef: { current: null },
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      toggleRecording: vi.fn(),
    });

    usePushToTalkMock.mockReturnValue({
      handleKeyDown: vi.fn(),
      handleKeyUp: vi.fn(),
    });

    renderHook(() => useComposerVoiceInput({
      value: 'test',
      getComposer: () => composer,
      onValueChange,
    }));

    expect(transcriptOptions).toBeDefined();
    expect(transcriptOptions?.getCursorOffset()).toBe(4);

    act(() => {
      transcriptOptions?.applyValue('updated', 7, { start: 4, end: 7 });
    });

    expect(composer.syncValue).toHaveBeenCalledWith('updated', 7, { start: 4, end: 7 });
    expect(onValueChange).toHaveBeenCalledWith('updated', 7);
  });

  it('focuses the composer surface before starting voice input', () => {
    const composer = {
      focus: vi.fn(),
      getSelectionOffset: vi.fn(() => 2),
      syncValue: vi.fn(),
    };

    const toggleRecording = vi.fn();

    useVoiceTranscriptMock.mockReturnValue({
      handleTranscriptEvent: vi.fn(),
      startSession: vi.fn(),
      stopSession: vi.fn(),
    });

    useVoiceInputMock.mockReturnValue({
      state: 'idle',
      analyserRef: { current: null },
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      toggleRecording,
    });

    usePushToTalkMock.mockReturnValue({
      handleKeyDown: vi.fn(),
      handleKeyUp: vi.fn(),
    });

    const { result } = renderHook(() => useComposerVoiceInput({
      value: 'hi',
      getComposer: () => composer,
      onValueChange: vi.fn(),
    }));

    act(() => {
      result.current.toggleRecording();
    });

    expect(composer.focus).toHaveBeenCalledTimes(1);
    expect(toggleRecording).toHaveBeenCalledTimes(1);
    expect(composer.focus.mock.invocationCallOrder[0]).toBeLessThan(toggleRecording.mock.invocationCallOrder[0]);
  });

  it('restores push-to-talk snapshots through the same composer surface', () => {
    const composer = {
      focus: vi.fn(),
      getSelectionOffset: vi.fn(() => 5),
      syncValue: vi.fn(),
    };
    const onValueChange = vi.fn();
    const startRecording = vi.fn();

    let pushToTalkOptions:
      | {
          getInputSnapshot: () => { value: string; cursor: number };
          restoreInput: (snapshot: { value: string; cursor: number }) => void;
          startRecording: () => void;
        }
      | undefined;

    useVoiceTranscriptMock.mockReturnValue({
      handleTranscriptEvent: vi.fn(),
      startSession: vi.fn(),
      stopSession: vi.fn(),
    });

    useVoiceInputMock.mockReturnValue({
      state: 'idle',
      analyserRef: { current: null },
      startRecording,
      stopRecording: vi.fn(),
      toggleRecording: vi.fn(),
    });

    usePushToTalkMock.mockImplementation((options) => {
      pushToTalkOptions = options;
      return {
        handleKeyDown: vi.fn(),
        handleKeyUp: vi.fn(),
      };
    });

    renderHook(() => useComposerVoiceInput({
      value: 'draft',
      getComposer: () => composer,
      onValueChange,
    }));

    expect(pushToTalkOptions?.getInputSnapshot()).toEqual({ value: 'draft', cursor: 5 });

    act(() => {
      pushToTalkOptions?.restoreInput({ value: 'snapshot', cursor: 3 });
      pushToTalkOptions?.startRecording();
    });

    expect(composer.syncValue).toHaveBeenCalledWith('snapshot', 3, undefined);
    expect(onValueChange).toHaveBeenCalledWith('snapshot', 3);
    expect(composer.focus.mock.invocationCallOrder.at(-1)).toBeLessThan(startRecording.mock.invocationCallOrder[0]);
  });

  it('keeps internal bridge callbacks stable when the caller recreates getComposer', () => {
    const composer = {
      focus: vi.fn(),
      getSelectionOffset: vi.fn(() => 2),
      syncValue: vi.fn(),
    };

    useVoiceTranscriptMock.mockReturnValue({
      handleTranscriptEvent: vi.fn(),
      startSession: vi.fn(),
      stopSession: vi.fn(),
    });

    useVoiceInputMock.mockReturnValue({
      state: 'idle',
      analyserRef: { current: null },
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      toggleRecording: vi.fn(),
    });

    usePushToTalkMock.mockReturnValue({
      handleKeyDown: vi.fn(),
      handleKeyUp: vi.fn(),
    });

    const onValueChange = vi.fn();
    const { rerender } = renderHook(
      ({ value }) => useComposerVoiceInput({
        value,
        getComposer: () => composer,
        onValueChange,
      }),
      { initialProps: { value: 'draft' } }
    );

    const firstTranscriptOptions = useVoiceTranscriptMock.mock.calls[0][0];
    const firstPushToTalkOptions = usePushToTalkMock.mock.calls[0][0];

    rerender({ value: 'draft plus' });

    const secondTranscriptOptions = useVoiceTranscriptMock.mock.calls[1][0];
    const secondPushToTalkOptions = usePushToTalkMock.mock.calls[1][0];

    expect(secondTranscriptOptions.getValue).toBe(firstTranscriptOptions.getValue);
    expect(secondTranscriptOptions.getCursorOffset).toBe(firstTranscriptOptions.getCursorOffset);
    expect(secondTranscriptOptions.applyValue).toBe(firstTranscriptOptions.applyValue);
    expect(secondPushToTalkOptions.getInputSnapshot).toBe(firstPushToTalkOptions.getInputSnapshot);
    expect(secondPushToTalkOptions.restoreInput).toBe(firstPushToTalkOptions.restoreInput);
    expect(secondPushToTalkOptions.startRecording).toBe(firstPushToTalkOptions.startRecording);
  });

  it('falls back to the current value when no composer surface is available', () => {
    const onValueChange = vi.fn();

    let transcriptOptions:
      | {
          getCursorOffset: () => number;
          applyValue: (value: string, cursorOffset: number, animateRange?: { start: number; end: number }) => void;
        }
      | undefined;

    useVoiceTranscriptMock.mockImplementation((options) => {
      transcriptOptions = options;
      return {
        handleTranscriptEvent: vi.fn(),
        startSession: vi.fn(),
        stopSession: vi.fn(),
      };
    });

    useVoiceInputMock.mockReturnValue({
      state: 'idle',
      analyserRef: { current: null },
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      toggleRecording: vi.fn(),
    });

    usePushToTalkMock.mockReturnValue({
      handleKeyDown: vi.fn(),
      handleKeyUp: vi.fn(),
    });

    renderHook(() => useComposerVoiceInput({
      value: 'draft',
      getComposer: () => null,
      onValueChange,
    }));

    expect(transcriptOptions?.getCursorOffset()).toBe(5);

    act(() => {
      transcriptOptions?.applyValue('updated', 7);
    });

    expect(onValueChange).toHaveBeenCalledWith('updated', 7);
  });
});
