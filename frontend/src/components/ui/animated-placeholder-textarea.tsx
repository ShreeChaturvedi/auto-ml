import { useRef, forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  useAnimatedPlaceholder,
  CHAR_ANIM_DURATION_MS,
  CHAR_STAGGER_MS,
} from './useAnimatedPlaceholder';

interface AnimatedPlaceholderTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'placeholder'> {
  placeholders: string[];
  interval?: number;
  autoResize?: boolean;
}

const AnimatedPlaceholderTextarea = forwardRef<
  HTMLTextAreaElement,
  AnimatedPlaceholderTextareaProps
>(({ placeholders, interval = 3000, autoResize = false, className, value, style, onFocus, onBlur, disabled, readOnly, ...props }, ref) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);

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

  // Auto-resize: adjust textarea height to match content
  useEffect(() => {
    if (!autoResize || !internalRef.current) return;
    const el = internalRef.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [autoResize, value]);

  return (
    <div className="relative w-full h-full">
      <textarea
        ref={(node) => {
          internalRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        style={{
          ...style,
          caretColor: showOverlayCaret ? 'transparent' : style?.caretColor,
          ...(autoResize ? { overflow: 'hidden' } : {}),
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
          className="pointer-events-none absolute inset-0 flex items-start overflow-hidden p-3"
          aria-hidden="true"
        >
          <div className="relative w-full overflow-hidden">
            {showOverlayCaret && (
              <span
                data-placeholder-cursor="true"
                className="absolute left-0 z-10 w-px rounded-full bg-foreground"
                style={{
                  top: '0.1em',
                  height: '1.2em',
                  opacity: prefersReducedMotion ? 0.7 : 1,
                  animation: prefersReducedMotion ? 'none' : 'nl-cursor-blink 700ms step-end infinite',
                }}
              />
            )}

            {/* Current placeholder – slides up and fades out during animation */}
            <span
              className="block text-sm text-muted-foreground whitespace-pre-wrap break-words"
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
              className="absolute inset-x-0 top-0 text-sm whitespace-pre-wrap break-words"
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
                        display: 'inline',
                        animation: `placeholder-char-in ${CHAR_ANIM_DURATION_MS}ms ease-out both`,
                        animationDelay: `${i * CHAR_STAGGER_MS}ms`,
                      }}
                      >
                      {char}
                    </span>
                  ))
                : nextPlaceholder}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

AnimatedPlaceholderTextarea.displayName = 'AnimatedPlaceholderTextarea';

export { AnimatedPlaceholderTextarea };
