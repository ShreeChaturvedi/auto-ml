import { useEffect, useMemo, useRef, useState } from 'react';

type PacingPreset = 'balanced';

interface UseProgressiveRevealOptions {
  text: string;
  isLive: boolean;
  animateOnMount?: boolean;
  prefersReducedMotion?: boolean;
  pacingPreset?: PacingPreset;
}

interface UseProgressiveRevealResult {
  visibleText: string;
  visibleCharCount: number;
  isRevealing: boolean;
  isCatchup: boolean;
  isFullyRevealed: boolean;
}

const BASE_CPS = 36;
const MAX_BACKLOG_BOOST = 3;
const BACKLOG_DIVISOR = 120;
const MIN_LIVE_CPS = 36;
const MAX_LIVE_CPS = 170;
const MIN_CATCHUP_CPS = 144;
const MAX_CATCHUP_CPS = 420;
const CATCHUP_MULTIPLIER = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getInitialVisibleCount({
  text,
  isLive,
  animateOnMount,
  prefersReducedMotion,
}: Required<Pick<UseProgressiveRevealOptions, 'text' | 'isLive' | 'animateOnMount' | 'prefersReducedMotion'>>) {
  if (prefersReducedMotion) return text.length;
  if (!animateOnMount && !isLive) return text.length;
  return 0;
}

export function useProgressiveReveal({
  text,
  isLive,
  animateOnMount = true,
  prefersReducedMotion = false,
  pacingPreset = 'balanced',
}: UseProgressiveRevealOptions): UseProgressiveRevealResult {
  void pacingPreset;

  const [visibleCharCount, setVisibleCharCount] = useState(() =>
    getInitialVisibleCount({ text, isLive, animateOnMount, prefersReducedMotion })
  );
  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      setVisibleCharCount(text.length);
      return;
    }

    setVisibleCharCount((prev) => {
      const clamped = Math.min(prev, text.length);
      if (!animateOnMount && !isLive) {
        return text.length;
      }
      return clamped;
    });
  }, [animateOnMount, isLive, prefersReducedMotion, text.length]);

  useEffect(() => {
    if (prefersReducedMotion || visibleCharCount >= text.length) {
      return;
    }

    const tick = (timestamp: number) => {
      if (lastFrameTsRef.current === null) {
        lastFrameTsRef.current = timestamp;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dtMs = timestamp - lastFrameTsRef.current;
      lastFrameTsRef.current = timestamp;

      setVisibleCharCount((prev) => {
        if (prev >= text.length) return text.length;

        const backlog = text.length - prev;
        const backlogBoost = Math.min(MAX_BACKLOG_BOOST, backlog / BACKLOG_DIVISOR);
        const liveCps = clamp(BASE_CPS * (1 + backlogBoost), MIN_LIVE_CPS, MAX_LIVE_CPS);
        const cps = isLive
          ? liveCps
          : clamp(liveCps * CATCHUP_MULTIPLIER, MIN_CATCHUP_CPS, MAX_CATCHUP_CPS);
        const advance = Math.max(1, Math.floor((cps * dtMs) / 1000));

        return Math.min(prev + advance, text.length);
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastFrameTsRef.current = null;
    };
  }, [isLive, prefersReducedMotion, text.length, visibleCharCount]);

  const clampedVisibleCharCount = Math.min(visibleCharCount, text.length);
  const visibleText = useMemo(
    () => text.slice(0, clampedVisibleCharCount),
    [text, clampedVisibleCharCount]
  );

  return {
    visibleText,
    visibleCharCount: clampedVisibleCharCount,
    isRevealing: clampedVisibleCharCount < text.length,
    isCatchup: !isLive && clampedVisibleCharCount < text.length,
    isFullyRevealed: clampedVisibleCharCount >= text.length,
  };
}

export type { PacingPreset, UseProgressiveRevealOptions, UseProgressiveRevealResult };
