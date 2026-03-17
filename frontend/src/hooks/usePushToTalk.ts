import { useCallback, useEffect, useRef } from 'react';

import type { VoiceState } from '@/hooks/useVoiceInput';

interface InputSnapshot {
  value: string;
  cursor: number;
}

interface UsePushToTalkOptions {
  disabled?: boolean;
  voiceState: VoiceState;
  holdDelayMs?: number;
  getInputSnapshot: () => InputSnapshot;
  restoreInput: (snapshot: InputSnapshot) => void;
  startRecording: () => void;
  stopRecording: () => void;
}

interface UsePushToTalkReturn {
  handleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => boolean;
  handleKeyUp: (event: React.KeyboardEvent<HTMLDivElement>) => boolean;
}

export function usePushToTalk({
  disabled,
  voiceState,
  holdDelayMs = 400,
  getInputSnapshot,
  restoreInput,
  startRecording,
  stopRecording,
}: UsePushToTalkOptions): UsePushToTalkReturn {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRef = useRef<InputSnapshot | null>(null);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return false;
    }

    if (event.key === 'Escape' && (voiceState === 'listening' || voiceState === 'connecting')) {
      event.preventDefault();
      stopRecording();
      return true;
    }

    if (event.key !== ' ') {
      return false;
    }

    if (voiceState === 'listening' || voiceState === 'connecting') {
      event.preventDefault();
      return true;
    }

    if (event.repeat && holdTimerRef.current) {
      event.preventDefault();
      return true;
    }

    if (!event.repeat) {
      snapshotRef.current = getInputSnapshot();
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;

        if (snapshotRef.current) {
          restoreInput(snapshotRef.current);
        }

        startRecording();
      }, holdDelayMs);
    }

    return false;
  }, [disabled, getInputSnapshot, holdDelayMs, restoreInput, startRecording, stopRecording, voiceState]);

  const handleKeyUp = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ') {
      return false;
    }

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      snapshotRef.current = null;
      return false;
    }

    if (voiceState === 'listening' || voiceState === 'connecting') {
      stopRecording();
      return true;
    }

    return false;
  }, [stopRecording, voiceState]);

  useEffect(() => () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }
  }, []);

  return {
    handleKeyDown,
    handleKeyUp,
  };
}
