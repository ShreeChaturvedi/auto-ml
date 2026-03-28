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

export const SLIDE_DURATION_MS = 225;
export const CHAR_ANIM_DURATION_MS = 270;
export const CHAR_STAGGER_MS = 36;

const RESET_BUFFER_MS = 150;
const MIN_RESET_TIMEOUT_MS = SLIDE_DURATION_MS + RESET_BUFFER_MS;

function countCharacters(value: string): number {
  return Array.from(value).length;
}

function randomIndex(len: number): number {
  return len > 0 ? Math.floor(Math.random() * len) : 0;
}

/** Animation delay for character at `charIndex`. Linear stagger at CHAR_STAGGER_MS. */
export function computeCharDelay(charIndex: number): number {
  return charIndex * CHAR_STAGGER_MS;
}

/** Total animation duration for `charCount` characters (last char delay + anim + buffer). */
export function computeResetTimeout(charCount: number): number {
  const n = Math.max(1, charCount);
  return Math.max(
    MIN_RESET_TIMEOUT_MS,
    computeCharDelay(n - 1) + CHAR_ANIM_DURATION_MS + RESET_BUFFER_MS,
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
  const [currentIndex, setCurrentIndex] = useState(() => randomIndex(placeholders.length));
  const [isAnimating, setIsAnimating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Suppresses CSS transition during the post-animation snap-back to idle positions.
  const [skipTransition, setSkipTransition] = useState(false);

  const resetTimeoutRef = useRef<number | null>(null);
  const firstRafRef = useRef<number | null>(null);
  const secondRafRef = useRef<number | null>(null);
  const currentIndexRef = useRef(currentIndex);
  const isAnimatingRef = useRef(false);
  const placeholdersRef = useRef(placeholders);
  placeholdersRef.current = placeholders;
  const hasValue = hasControlledValue(value);
  const prefersReducedMotion = usePrefersReducedMotion();
  const placeholderSignature = placeholders.join('\u0000');

  useEffect(() => {
    const idx = randomIndex(placeholdersRef.current.length);
    currentIndexRef.current = idx;
    isAnimatingRef.current = false;
    setCurrentIndex(idx);
    setIsAnimating(false);
    setSkipTransition(false);
  }, [placeholderSignature]);

  useEffect(() => {
    const len = placeholdersRef.current.length;
    if (len === 0) {
      currentIndexRef.current = 0;
      if (currentIndex !== 0) setCurrentIndex(0);
      return;
    }

    if (currentIndexRef.current >= len) {
      currentIndexRef.current = 0;
      setCurrentIndex(0);
    }
  }, [currentIndex, placeholderSignature]);

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

    const ph = placeholdersRef.current;
    if (hasValue || ph.length <= 1 || prefersReducedMotion) {
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

      const cur = placeholdersRef.current;
      const nextIndex = (currentIndexRef.current + 1) % cur.length;
      const nextPlaceholderText = cur[nextIndex] ?? '';

      resetTimeoutRef.current = window.setTimeout(() => {
        setCurrentIndex(nextIndex);
        currentIndexRef.current = nextIndex;
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
      }, computeResetTimeout(countCharacters(nextPlaceholderText)));
    };

    const intervalId = window.setInterval(cycle, interval);

    return () => {
      window.clearInterval(intervalId);
      clearPendingAnimationWork();
      isAnimatingRef.current = false;
    };
  }, [hasValue, placeholderSignature, interval, prefersReducedMotion]);

  const currentPlaceholder = placeholders[currentIndex] ?? '';
  const nextPlaceholder = placeholders[(currentIndex + 1) % placeholders.length] ?? '';
  const showOverlayCaret = !hasValue && isFocused && !disabled && !readOnly;

  // Incoming span omits opacity transition so per-character animations own visibility.
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
