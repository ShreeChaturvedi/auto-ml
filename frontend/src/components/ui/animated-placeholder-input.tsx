/**
 * AnimatedPlaceholderInput - Input with cycling placeholder animation
 *
 * Displays placeholder text that cycles through a list with a smooth
 * slide-up-out / slide-up-in transition effect.
 */

import { useState, useEffect, useRef, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedPlaceholderInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'placeholder'> {
  placeholders: string[];
  interval?: number;
  /** Left padding in rem to align with icons */
  leftPadding?: number;
}

const AnimatedPlaceholderInput = forwardRef<HTMLInputElement, AnimatedPlaceholderInputProps>(
  ({ placeholders, interval = 3000, leftPadding, className, value, ...props }, ref) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    const hasValue = typeof value === 'string' ? value.length > 0 : false;

    useEffect(() => {
      if (hasValue || placeholders.length <= 1) return;

      const cycle = () => {
        // Start animation - current slides out, next slides in
        setIsAnimating(true);

        // After animation completes, update index and reset
        timeoutRef.current = window.setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % placeholders.length);
          // Small delay to ensure state updates before removing animation class
          requestAnimationFrame(() => {
            setIsAnimating(false);
          });
        }, 350);
      };

      const intervalId = window.setInterval(cycle, interval);

      return () => {
        window.clearInterval(intervalId);
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
        }
      };
    }, [hasValue, placeholders.length, interval]);

    const currentPlaceholder = placeholders[currentIndex] || '';
    const nextPlaceholder = placeholders[(currentIndex + 1) % placeholders.length] || '';

    // Calculate left padding - use provided value or parse from className
    const paddingLeft = leftPadding
      ? `${leftPadding}rem`
      : className?.includes('pl-9')
        ? '2.25rem'
        : '0.75rem';

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          value={value}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...props}
        />
        {/* Animated placeholder overlay */}
        {!hasValue && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden"
            style={{ paddingLeft, paddingRight: '0.75rem' }}
          >
            <div className="relative h-5 w-full overflow-hidden">
              {/* Current placeholder - slides up and out */}
              <span
                className="absolute inset-x-0 top-0 text-sm text-muted-foreground whitespace-nowrap transition-all duration-300 ease-out"
                style={{
                  transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
                  opacity: isAnimating ? 0 : 1
                }}
              >
                {currentPlaceholder}
              </span>
              {/* Next placeholder - slides up from below */}
              <span
                className="absolute inset-x-0 top-0 text-sm text-muted-foreground whitespace-nowrap transition-all duration-300 ease-out"
                style={{
                  transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
                  opacity: isAnimating ? 1 : 0
                }}
              >
                {nextPlaceholder}
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
