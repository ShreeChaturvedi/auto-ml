import { useReducer, useEffect, useRef } from 'react';

const TOKEN_INTERVAL_MS = 65;
const TYPEWRITER_START_DELAY_MS = 150;

export interface TypewriterState {
  visibleTokenCount: number;
  isComplete: boolean;
}

export function useTypewriter(
  totalTokens: number,
  isActive: boolean
): TypewriterState {
  const stateRef = useRef<TypewriterState>({ visibleTokenCount: 0, isComplete: false });
  const forceUpdate = useReducer((n: number) => n + 1, 0)[1];
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenIndexRef = useRef(0);
  const targetRef = useRef(totalTokens);

  useEffect(() => {
    targetRef.current = totalTokens;
  }, [totalTokens]);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (startDelayRef.current !== null) clearTimeout(startDelayRef.current);
      stateRef.current = { visibleTokenCount: 0, isComplete: false };
      tokenIndexRef.current = 0;
      forceUpdate();
      return;
    }

    tokenIndexRef.current = 0;
    stateRef.current = { visibleTokenCount: 0, isComplete: false };
    forceUpdate();

    startDelayRef.current = setTimeout(() => {
      startDelayRef.current = null;

      intervalRef.current = setInterval(() => {
        const total = targetRef.current;
        tokenIndexRef.current = Math.min(tokenIndexRef.current + 1, total);
        const done = tokenIndexRef.current >= total;
        stateRef.current = { visibleTokenCount: tokenIndexRef.current, isComplete: done };
        forceUpdate();

        if (done && intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, TOKEN_INTERVAL_MS);
    }, TYPEWRITER_START_DELAY_MS);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (startDelayRef.current !== null) clearTimeout(startDelayRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return stateRef.current;
}
