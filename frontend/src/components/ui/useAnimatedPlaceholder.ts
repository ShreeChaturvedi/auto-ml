/**
 * useAnimatedPlaceholder — shared animation state machine for
 * AnimatedPlaceholderInput and AnimatedPlaceholderTextarea.
 *
 * Animation phases:
 *  1. idle        – currentIndex span at translateY(0), next at translateY(100%) (hidden)
 *  2. animating   – current slides up to -100%, next slides up from 100% to 0.
 *                   Incoming characters each run `placeholder-char-in` with a staggered
 *                   delay so they lift in one-by-one with a brief color "bloom" (shine).
 *  3. snap        – index advances, transitions DISABLED so spans teleport to idle
 *                   positions silently (prevents the visible backward slide)
 *  4. idle        – transitions re-enabled; ready for next cycle
 */

import { useState, useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

// 25% faster than the original 300 ms slide.
export const SLIDE_DURATION_MS = 225;
// Per-character animation duration — kept separate from the slide so the shine
// pace can be tuned without affecting the container slide speed.
// ~20% longer than SLIDE_DURATION_MS so the color bloom lingers visibly.
export const CHAR_ANIM_DURATION_MS = 270;
// Stagger delay between each character in the incoming word.
// Larger value = more obvious wave effect.
export const CHAR_STAGGER_MS = 30;

const RESET_BUFFER_MS = 20;
const MIN_RESET_TIMEOUT_MS = SLIDE_DURATION_MS + RESET_BUFFER_MS;

function countCharacters(value: string): number {
  return Array.from(value).length;
}

function getResetTimeoutMs(nextPlaceholder: string): number {
  const charCount = Math.max(1, countCharacters(nextPlaceholder));
  return Math.max(
    MIN_RESET_TIMEOUT_MS,
    (charCount - 1) * CHAR_STAGGER_MS + CHAR_ANIM_DURATION_MS + RESET_BUFFER_MS
  );
}

export function hasControlledValue(
  value: string | number | readonly string[] | null | undefined
): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).length > 0;
}

export interface UseAnimatedPlaceholderOptions {
  placeholders: string[];
  interval?: number;
  value: string | number | readonly string[] | null | undefined;
  disabled?: boolean;
  readOnly?: boolean;
}

export interface UseAnimatedPlaceholderResult {
  currentPlaceholder: string;
  nextPlaceholder: string;
  isAnimating: boolean;
  isFocused: boolean;
  hasValue: boolean;
  showOverlayCaret: boolean;
  outgoingTransition: string;
  incomingTransition: string;
  prefersReducedMotion: boolean;
  handleFocus: () => void;
  handleBlur: () => void;
}

export function useAnimatedPlaceholder({
  placeholders,
  interval = 3000,
  value,
  disabled,
  readOnly,
}: UseAnimatedPlaceholderOptions): UseAnimatedPlaceholderResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // When true the CSS transition is suppressed so the post-animation snap
  // back to idle positions is invisible (avoids the backward slide artifact).
  const [skipTransition, setSkipTransition] = useState(false);

  const resetTimeoutRef = useRef<number | null>(null);
  const firstRafRef = useRef<number | null>(null);
  const secondRafRef = useRef<number | null>(null);
  const currentIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);

  const hasValue = hasControlledValue(value);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (placeholders.length === 0) {
      currentIndexRef.current = 0;
      if (currentIndex !== 0) setCurrentIndex(0);
      return;
    }

    if (currentIndexRef.current >= placeholders.length) {
      currentIndexRef.current = 0;
      setCurrentIndex(0);
    }
  }, [currentIndex, placeholders.length]);

  useEffect(() => {
    const clearPendingAnimationWork = () => {
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

    if (hasValue || placeholders.length <= 1 || prefersReducedMotion) {
      clearPendingAnimationWork();
      isAnimatingRef.current = false;
      setIsAnimating(false);
      setSkipTransition(false);
      return;
    }

    const cycle = () => {
      if (isAnimatingRef.current) return;

      isAnimatingRef.current = true;
      setIsAnimating(true);

      const nextIndex = (currentIndexRef.current + 1) % placeholders.length;
      const nextPlaceholderText = placeholders[nextIndex] ?? '';

      resetTimeoutRef.current = window.setTimeout(() => {
        setCurrentIndex(nextIndex);
        currentIndexRef.current = nextIndex;
        setIsAnimating(false);
        setSkipTransition(true);
        isAnimatingRef.current = false;
        resetTimeoutRef.current = null;

        // Re-enable transitions only after the snap frame is committed.
        firstRafRef.current = requestAnimationFrame(() => {
          firstRafRef.current = null;
          secondRafRef.current = requestAnimationFrame(() => {
            setSkipTransition(false);
            secondRafRef.current = null;
          });
        });
      }, getResetTimeoutMs(nextPlaceholderText));
    };

    const intervalId = window.setInterval(cycle, interval);

    return () => {
      window.clearInterval(intervalId);
      clearPendingAnimationWork();
      isAnimatingRef.current = false;
    };
  }, [hasValue, placeholders, interval, prefersReducedMotion]);

  const currentPlaceholder = placeholders[currentIndex] ?? '';
  const nextPlaceholder = placeholders[(currentIndex + 1) % placeholders.length] ?? '';
  const showOverlayCaret = !hasValue && isFocused && !disabled && !readOnly;

  // Outgoing span fades AND slides (both transform + opacity transition).
  // Incoming span only slides — its opacity is snapped to 1 immediately so
  // the per-character animations fully own visibility and the stagger is not
  // washed out by a competing container opacity transition.
  const outgoingTransition = skipTransition
    ? 'none'
    : `transform ${SLIDE_DURATION_MS}ms ease-out, opacity ${SLIDE_DURATION_MS}ms ease-out`;
  const incomingTransition = skipTransition
    ? 'none'
    : `transform ${SLIDE_DURATION_MS}ms ease-out`;

  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => setIsFocused(false);

  return {
    currentPlaceholder,
    nextPlaceholder,
    isAnimating,
    isFocused,
    hasValue,
    showOverlayCaret,
    outgoingTransition,
    incomingTransition,
    prefersReducedMotion,
    handleFocus,
    handleBlur,
  };
}
