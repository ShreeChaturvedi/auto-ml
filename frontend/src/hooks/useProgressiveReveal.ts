import { useEffect, useMemo, useRef, useState } from 'react';

import { splitGraphemes } from '@/lib/text/graphemes';

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
  visibleSegments: string[];
  visibleCharCount: number;
  isRevealing: boolean;
  isCatchup: boolean;
  isFullyRevealed: boolean;
}

interface PacingConfig {
  baseCps: number;
  backlogDivisor: number;
  maxBacklogBoost: number;
  minLiveCps: number;
  maxLiveCps: number;
  catchupMultiplier: number;
  minCatchupCps: number;
  maxCatchupCps: number;
}

const PACING_PRESETS: Record<PacingPreset, PacingConfig> = {
  balanced: {
    baseCps: 36,
    backlogDivisor: 120,
    maxBacklogBoost: 3,
    minLiveCps: 36,
    maxLiveCps: 170,
    catchupMultiplier: 4,
    minCatchupCps: 144,
    maxCatchupCps: 420,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveVisibleCount({
  currentCount,
  targetCount,
  animateOnMount,
  isLive,
  prefersReducedMotion,
}: {
  currentCount: number;
  targetCount: number;
  animateOnMount: boolean;
  isLive: boolean;
  prefersReducedMotion: boolean;
}): number {
  if (prefersReducedMotion) return targetCount;
  if (!animateOnMount && !isLive) return targetCount;
  return Math.min(currentCount, targetCount);
}

export function useProgressiveReveal({
  text,
  isLive,
  animateOnMount = true,
  prefersReducedMotion = false,
  pacingPreset = 'balanced',
}: UseProgressiveRevealOptions): UseProgressiveRevealResult {
  const segments = useMemo(() => splitGraphemes(text), [text]);
  const targetCount = segments.length;
  const pacing = PACING_PRESETS[pacingPreset];

  const [visibleCharCount, setVisibleCharCount] = useState(() =>
    resolveVisibleCount({
      currentCount: 0,
      targetCount,
      animateOnMount,
      isLive,
      prefersReducedMotion,
    })
  );

  const visibleCountRef = useRef(visibleCharCount);
  const frameRequestRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);

  useEffect(() => {
    visibleCountRef.current = visibleCharCount;
  }, [visibleCharCount]);

  useEffect(() => {
    const resolved = resolveVisibleCount({
      currentCount: visibleCountRef.current,
      targetCount,
      animateOnMount,
      isLive,
      prefersReducedMotion,
    });

    visibleCountRef.current = resolved;
    setVisibleCharCount(resolved);
  }, [animateOnMount, isLive, prefersReducedMotion, targetCount]);

  useEffect(() => {
    if (prefersReducedMotion || visibleCountRef.current >= targetCount) {
      if (frameRequestRef.current !== null) {
        cancelAnimationFrame(frameRequestRef.current);
        frameRequestRef.current = null;
      }
      lastFrameTsRef.current = null;
      return;
    }

    const tick = (timestamp: number) => {
      if (lastFrameTsRef.current === null) {
        lastFrameTsRef.current = timestamp;
        frameRequestRef.current = requestAnimationFrame(tick);
        return;
      }

      const dtMs = timestamp - lastFrameTsRef.current;
      lastFrameTsRef.current = timestamp;

      const prev = visibleCountRef.current;
      if (prev >= targetCount) {
        frameRequestRef.current = null;
        lastFrameTsRef.current = null;
        return;
      }

      const backlog = targetCount - prev;
      const backlogBoost = Math.min(pacing.maxBacklogBoost, backlog / pacing.backlogDivisor);
      const liveCps = clamp(
        pacing.baseCps * (1 + backlogBoost),
        pacing.minLiveCps,
        pacing.maxLiveCps
      );
      const cps = isLive
        ? liveCps
        : clamp(
            liveCps * pacing.catchupMultiplier,
            pacing.minCatchupCps,
            pacing.maxCatchupCps
          );
      const advance = Math.max(1, Math.floor((cps * dtMs) / 1000));
      const next = Math.min(prev + advance, targetCount);

      if (next !== prev) {
        visibleCountRef.current = next;
        setVisibleCharCount(next);
      }

      if (next < targetCount) {
        frameRequestRef.current = requestAnimationFrame(tick);
        return;
      }

      frameRequestRef.current = null;
      lastFrameTsRef.current = null;
    };

    frameRequestRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRequestRef.current !== null) {
        cancelAnimationFrame(frameRequestRef.current);
        frameRequestRef.current = null;
      }
      lastFrameTsRef.current = null;
    };
  }, [isLive, pacing, prefersReducedMotion, targetCount]);

  const clampedVisibleCharCount = Math.min(visibleCharCount, targetCount);
  const visibleSegments = useMemo(
    () => segments.slice(0, clampedVisibleCharCount),
    [segments, clampedVisibleCharCount]
  );
  const visibleText = useMemo(() => visibleSegments.join(''), [visibleSegments]);

  return {
    visibleText,
    visibleSegments,
    visibleCharCount: clampedVisibleCharCount,
    isRevealing: clampedVisibleCharCount < targetCount,
    isCatchup: !isLive && clampedVisibleCharCount < targetCount,
    isFullyRevealed: clampedVisibleCharCount >= targetCount,
  };
}

export type { PacingPreset, UseProgressiveRevealOptions, UseProgressiveRevealResult };
