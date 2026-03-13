import { useCallback, useRef, type RefObject } from 'react';

import type { MentionInputHandle } from '@/components/llm/MentionInput';
import { usePushToTalk } from '@/hooks/usePushToTalk';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useVoiceTranscript } from '@/hooks/useVoiceTranscript';

interface UseComposerVoiceInputOptions {
  value: string;
  disabled?: boolean;
  inputRef: RefObject<MentionInputHandle | null>;
  onValueChange: (value: string, cursorOffset?: number) => void;
}

export function useComposerVoiceInput({
  value,
  disabled,
  inputRef,
  onValueChange,
}: UseComposerVoiceInputOptions) {
  const valueRef = useRef(value);
  valueRef.current = value;

  const getValue = useCallback(() => valueRef.current, []);

  const getCursorOffset = useCallback(() => {
    const handle = inputRef.current;
    if (!handle) {
      return valueRef.current.length;
    }

    return handle.getSelectionOffset();
  }, [inputRef]);

  const applyValue = useCallback((nextValue: string, cursorOffset: number, animateRange?: { start: number; end: number }) => {
    inputRef.current?.syncValue(nextValue, cursorOffset, animateRange);
    onValueChange(nextValue, cursorOffset);
  }, [inputRef, onValueChange]);

  const {
    handleTranscriptEvent,
    startSession,
    stopSession,
  } = useVoiceTranscript({
    getValue,
    getCursorOffset,
    applyValue,
  });

  const {
    state,
    analyserRef,
    startRecording,
    stopRecording,
    toggleRecording,
  } = useVoiceInput({
    onRecordingStart: startSession,
    onRecordingStop: stopSession,
    onTranscriptEvent: handleTranscriptEvent,
    disabled,
  });

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  const handleToggleRecording = useCallback(() => {
    if (state === 'idle' || state === 'error') {
      focusInput();
    }

    toggleRecording();
  }, [focusInput, state, toggleRecording]);

  const pushToTalk = usePushToTalk({
    disabled,
    voiceState: state,
    getInputSnapshot: () => ({
      value: valueRef.current,
      cursor: getCursorOffset(),
    }),
    restoreInput: (snapshot) => {
      applyValue(snapshot.value, snapshot.cursor);
    },
    startRecording: () => {
      focusInput();
      startRecording();
    },
    stopRecording,
  });

  return {
    state,
    analyserRef,
    toggleRecording: handleToggleRecording,
    stopRecording,
    handlePushToTalkKeyDown: pushToTalk.handleKeyDown,
    handlePushToTalkKeyUp: pushToTalk.handleKeyUp,
  };
}
