/**
 * useInsightTicker — animation state machine for the InsightTicker.
 * Adapted from useAnimatedPlaceholder with simplified logic:
 * - No input focus/caret management
 * - No controlled value
 * - Auto-cycles through items on interval
 */

import { useState, useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  SLIDE_DURATION_MS,
  computeResetTimeout,
} from './useAnimatedPlaceholder';

export interface UseInsightTickerResult {
  currentIndex: number;
  nextIndex: number;
  isAnimating: boolean;
  outgoingTransition: string;
  incomingTransition: string;
  prefersReducedMotion: boolean;
}

export function useInsightTicker(
  itemCount: number,
  interval = 3500,
  /** Per-item text lengths so reset timeout matches the actual reveal duration. */
  itemTextLengths?: number[],
): UseInsightTickerResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [skipTransition, setSkipTransition] = useState(false);

  const resetTimeoutRef = useRef<number | null>(null);
  const firstRafRef = useRef<number | null>(null);
  const secondRafRef = useRef<number | null>(null);
  const currentIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const itemTextLengthsRef = useRef(itemTextLengths);
  itemTextLengthsRef.current = itemTextLengths;
  const itemSignature = (itemTextLengths ?? []).join('\u0000');

  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Reset index if itemCount shrinks
  useEffect(() => {
    if (itemCount === 0) {
      currentIndexRef.current = 0;
      isAnimatingRef.current = false;
      setCurrentIndex(0);
      setIsAnimating(false);
      setSkipTransition(false);
      return;
    }

    if (currentIndexRef.current >= itemCount) {
      currentIndexRef.current = 0;
      isAnimatingRef.current = false;
      setCurrentIndex(0);
      setIsAnimating(false);
      setSkipTransition(false);
    }
  }, [itemCount, itemSignature]);

  useEffect(() => {
    const clearPending = () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
      if (firstRafRef.current !== null) {
        cancelAnimationFrame(firstRafRef.current);
        firstRafRef.current = null;
      }
      if (secondRafRef.current !== null) {
        cancelAnimationFrame(secondRafRef.current);
        secondRafRef.current = null;
      }
    };

    if (itemCount <= 1 || prefersReducedMotion) {
      clearPending();
      isAnimatingRef.current = false;
      setIsAnimating(false);
      setSkipTransition(false);
      return;
    }

    const cycle = () => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      setIsAnimating(true);

      const nextIdx = (currentIndexRef.current + 1) % itemCount;
      const textLen = itemTextLengthsRef.current?.[nextIdx] ?? 40;
      const resetMs = computeResetTimeout(textLen);

      resetTimeoutRef.current = window.setTimeout(() => {
        setCurrentIndex(nextIdx);
        currentIndexRef.current = nextIdx;
        setIsAnimating(false);
        setSkipTransition(true);
        isAnimatingRef.current = false;
        resetTimeoutRef.current = null;

        firstRafRef.current = requestAnimationFrame(() => {
          firstRafRef.current = null;
          secondRafRef.current = requestAnimationFrame(() => {
            setSkipTransition(false);
            secondRafRef.current = null;
          });
        });
      }, resetMs);
    };

    const intervalId = window.setInterval(cycle, interval);
    return () => {
      window.clearInterval(intervalId);
      clearPending();
      isAnimatingRef.current = false;
    };
  }, [itemCount, interval, prefersReducedMotion]);

  const safeCurrentIndex = itemCount > 0
    ? Math.min(currentIndex, itemCount - 1)
    : 0;
  const nextIndex = itemCount > 0 ? (safeCurrentIndex + 1) % itemCount : 0;

  const outgoingTransition = skipTransition
    ? 'none'
    : `transform ${SLIDE_DURATION_MS}ms ease-out, opacity ${SLIDE_DURATION_MS}ms ease-out`;
  const incomingTransition = skipTransition
    ? 'none'
    : `transform ${SLIDE_DURATION_MS}ms ease-out`;

  return {
    currentIndex: safeCurrentIndex,
    nextIndex,
    isAnimating,
    outgoingTransition,
    incomingTransition,
    prefersReducedMotion,
  };
}
