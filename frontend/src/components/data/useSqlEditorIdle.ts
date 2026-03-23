import { useState, useRef, useCallback, useEffect } from 'react';

const IDLE_DELAY_MS = 3000;

export interface SqlEditorIdleState {
  isFocused: boolean;
  isIdle: boolean;
  setFocused: (focused: boolean) => void;
  onActivity: () => void;
}

export function useSqlEditorIdle(): SqlEditorIdleState {
  const [isFocused, setIsFocused] = useState(false);
  const [isIdle, setIsIdle] = useState(true);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const setFocused = useCallback((focused: boolean) => {
    setIsFocused(focused);
    if (!focused) {
      clearTimer();
      setIsIdle(true);
    }
  }, [clearTimer]);

  const onActivity = useCallback(() => {
    setIsIdle(false);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setIsIdle(true);
      timerRef.current = null;
    }, IDLE_DELAY_MS);
  }, [clearTimer]);

  // Clear pending timer on unmount
  useEffect(() => () => clearTimer(), [clearTimer]);

  return { isFocused, isIdle, setFocused, onActivity };
}
