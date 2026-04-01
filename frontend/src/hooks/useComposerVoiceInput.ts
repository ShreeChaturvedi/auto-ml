import { useCallback, useRef } from 'react';

import { usePushToTalk } from '@/hooks/usePushToTalk';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useVoiceTranscript } from '@/hooks/useVoiceTranscript';
import {
  focusVoiceComposer,
  getVoiceComposerSelectionOffset,
  syncVoiceComposerValue,
  type GetVoiceComposer,
  type VoiceComposerAnimateRange,
} from '@/hooks/voiceComposerSurface';

interface UseComposerVoiceInputOptions {
  value: string;
  disabled?: boolean;
  getComposer: GetVoiceComposer;
  onValueChange: (value: string, cursorOffset?: number) => void;
}

export function useComposerVoiceInput({
  value,
  disabled,
  getComposer,
  onValueChange,
}: UseComposerVoiceInputOptions) {
  const valueRef = useRef(value);
  valueRef.current = value;

  const getValue = useCallback(() => valueRef.current, []);

  const getCursorOffset = useCallback(() => {
    return getVoiceComposerSelectionOffset(getComposer, valueRef.current);
  }, [getComposer]);

  const applyValue = useCallback((
    nextValue: string,
    cursorOffset: number,
    animateRange?: VoiceComposerAnimateRange
  ) => {
    syncVoiceComposerValue({
      getComposer,
      value: nextValue,
      cursorOffset,
      onValueChange,
      animateRange,
    });
  }, [getComposer, onValueChange]);

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
    focusVoiceComposer(getComposer);
  }, [getComposer]);

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
