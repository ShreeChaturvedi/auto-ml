/**
 * AnimatedPlaceholderInput - Input with cycling placeholder animation
 *
 * Displays placeholder text that cycles through a list with a smooth
 * slide-up-out / slide-up-in transition effect.
 *
 * Animation phases:
 *  1. idle        – currentIndex span at translateY(0), next span at translateY(100%) (hidden)
 *  2. animating   – current slides up to -100%, next slides up from 100% to 0.
 *                   Incoming characters each run `placeholder-char-in` with a staggered
 *                   delay so they lift in one-by-one with a brief color "bloom" (shine).
 *  3. snap        – index advances, transitions DISABLED so spans teleport to idle
 *                   positions silently (prevents the visible backward slide)
 *  4. idle        – transitions re-enabled; ready for next cycle
 */

import { useState, useEffect, useRef, forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface AnimatedPlaceholderInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'placeholder'> {
  placeholders: string[];
  interval?: number;
  /** Left padding in rem to align with icons */
  leftPadding?: number;
}

// 25% faster than the original 300 ms slide.
const SLIDE_DURATION_MS = 225;
// Per-character animation duration — kept separate from the slide so the shine
// pace can be tuned without affecting the container slide speed.
// ~20% longer than SLIDE_DURATION_MS so the color bloom lingers visibly.
const CHAR_ANIM_DURATION_MS = 270;
// Stagger delay between each character in the incoming word.
// Larger value = more obvious wave effect.
const CHAR_STAGGER_MS = 30;
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

function hasInputValue(value: InputHTMLAttributes<HTMLInputElement>['value']): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).length > 0;
}

const AnimatedPlaceholderInput = forwardRef<HTMLInputElement, AnimatedPlaceholderInputProps>(
  ({ placeholders, interval = 3000, leftPadding, className, value, ...props }, ref) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    // When true the CSS transition is suppressed so the post-animation snap
    // back to idle positions is invisible (avoids the backward slide artifact).
    const [skipTransition, setSkipTransition] = useState(false);
    const resetTimeoutRef = useRef<number | null>(null);
    const firstRafRef = useRef<number | null>(null);
    const secondRafRef = useRef<number | null>(null);
    const currentIndexRef = useRef(0);
    const isAnimatingRef = useRef(false);

    const hasValue = hasInputValue(value);
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
        const nextPlaceholder = placeholders[nextIndex] ?? '';

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
        }, getResetTimeoutMs(nextPlaceholder));
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

    const paddingLeft = leftPadding !== undefined
      ? `${leftPadding}rem`
      : /\bpl-9\b/.test(className ?? '')
        ? '2.25rem'
        : '0.75rem';

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

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          value={value}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...props}
        />
        {!hasValue && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden"
            aria-hidden="true"
            style={{ paddingLeft, paddingRight: '0.75rem' }}
          >
            <div className="relative h-5 w-full overflow-hidden">
              {/* Current placeholder – slides up and fades out during animation */}
              <span
                className="absolute inset-x-0 top-0 text-sm text-muted-foreground whitespace-nowrap"
                style={{
                  transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
                  opacity: isAnimating ? 0 : 1,
                  transition: outgoingTransition,
                }}
              >
                {currentPlaceholder}
              </span>

              {/* Next placeholder – slides up into view during animation.
                  Opacity snaps to 1 immediately (no container opacity transition)
                  so the per-character placeholder-char-in animations fully own
                  visibility: each character fades in at its staggered time and
                  briefly blooms to full foreground color before settling to muted. */}
              <span
                className="absolute inset-x-0 top-0 text-sm whitespace-nowrap"
                style={{
                  transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
                  opacity: isAnimating ? 1 : 0,
                  transition: incomingTransition,
                }}
              >
                {isAnimating
                  ? Array.from(nextPlaceholder).map((char, i) => (
                      <span
                        key={i}
                        style={{
                          display: 'inline-block',
                          animation: `placeholder-char-in ${CHAR_ANIM_DURATION_MS}ms ease-out both`,
                          animationDelay: `${i * CHAR_STAGGER_MS}ms`,
                        }}
                      >
                        {char === ' ' ? '\u00a0' : char}
                      </span>
                    ))
                  : nextPlaceholder}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }
);

AnimatedPlaceholderInput.displayName = 'AnimatedPlaceholderInput';

export { AnimatedPlaceholderInput };
