import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import {
  useAnimatedPlaceholder,
  CHAR_ANIM_DURATION_MS,
  CHAR_STAGGER_MS,
} from './useAnimatedPlaceholder';

interface AnimatedPlaceholderInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'placeholder'> {
  placeholders: string[];
  interval?: number;
  /** Left padding in rem to align with icons */
  leftPadding?: number;
}

const AnimatedPlaceholderInput = forwardRef<HTMLInputElement, AnimatedPlaceholderInputProps>(
  (
    {
      placeholders,
      interval = 3000,
      leftPadding,
      className,
      value,
      style,
      onFocus,
      onBlur,
      disabled,
      readOnly,
      ...props
    },
    ref
  ) => {
    const {
      currentPlaceholder,
      nextPlaceholder,
      isAnimating,
      hasValue,
      showOverlayCaret,
      outgoingTransition,
      incomingTransition,
      prefersReducedMotion,
      handleFocus,
      handleBlur,
    } = useAnimatedPlaceholder({ placeholders, interval, value, disabled, readOnly });

    const paddingLeft = leftPadding !== undefined
      ? `${leftPadding}rem`
      : /\bpl-9\b/.test(className ?? '')
        ? '2.25rem'
        : '0.75rem';

    // Match overlay text size to the input's effective text size
    const textSize = className?.match(/\btext-(xs|sm|base|lg|xl)\b/)?.[0] ?? 'text-sm';

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          style={{
            ...style,
            caretColor: showOverlayCaret ? 'transparent' : style?.caretColor,
          }}
          onFocus={(event) => {
            handleFocus();
            onFocus?.(event);
          }}
          onBlur={(event) => {
            handleBlur();
            onBlur?.(event);
          }}
          {...props}
        />
        {!hasValue && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden"
            aria-hidden="true"
            style={{ paddingLeft, paddingRight: '0.75rem' }}
          >
            <div className="relative h-5 w-full overflow-hidden">
              {showOverlayCaret && (
                <span
                  data-placeholder-cursor="true"
                  className="absolute left-0 top-1/2 z-10 w-px -translate-y-1/2 rounded-full bg-foreground"
                  style={{
                    height: '1.1em',
                    opacity: prefersReducedMotion ? 0.7 : 1,
                    animation: prefersReducedMotion ? 'none' : 'nl-cursor-blink 700ms step-end infinite',
                  }}
                />
              )}

              {/* Current placeholder – slides up and fades out during animation */}
              <span
                className={`absolute inset-x-0 top-0 ${textSize} text-muted-foreground whitespace-nowrap`}
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
                className={`absolute inset-x-0 top-0 ${textSize} whitespace-nowrap`}
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
