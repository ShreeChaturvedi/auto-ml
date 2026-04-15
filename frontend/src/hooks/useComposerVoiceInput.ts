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
  const getComposerRef = useRef(getComposer);
  getComposerRef.current = getComposer;

  const getValue = useCallback(() => valueRef.current, []);
  const resolveComposer = useCallback(() => getComposerRef.current(), []);

  const getCursorOffset = useCallback(() => {
    return getVoiceComposerSelectionOffset(resolveComposer, valueRef.current);
  }, [resolveComposer]);

  const applyValue = useCallback((
    nextValue: string,
    cursorOffset: number,
    animateRange?: VoiceComposerAnimateRange
  ) => {
    syncVoiceComposerValue({
      getComposer: resolveComposer,
      value: nextValue,
      cursorOffset,
      onValueChange,
      animateRange,
    });
  }, [onValueChange, resolveComposer]);

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
    focusVoiceComposer(resolveComposer);
  }, [resolveComposer]);

  const handleToggleRecording = useCallback(() => {
    if (state === 'idle' || state === 'error') {
      focusInput();
    }

    toggleRecording();
  }, [focusInput, state, toggleRecording]);

  const getInputSnapshot = useCallback(() => ({
    value: valueRef.current,
    cursor: getCursorOffset(),
  }), [getCursorOffset]);

  const restoreInput = useCallback((snapshot: { value: string; cursor: number }) => {
    applyValue(snapshot.value, snapshot.cursor);
  }, [applyValue]);

  const startPushToTalkRecording = useCallback(() => {
    focusInput();
    startRecording();
  }, [focusInput, startRecording]);

  const pushToTalk = usePushToTalk({
    disabled,
    voiceState: state,
    getInputSnapshot,
    restoreInput,
    startRecording: startPushToTalkRecording,
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
