/**
 * Ring — compact SVG progress ring. Generalisation of the hand-rolled
 * rings in `ContextUsageIndicator.tsx` and `data/eda/QualityPanel.tsx`.
 *
 * Color is driven by `currentColor`, so callers pick the stroke via a
 * single Tailwind text class (e.g. `text-metric-positive`) rather than
 * per-instance HSL math. `PercentRing` is a thin convenience that
 * defaults to `text-metric-positive` for "how strong a match" displays
 * (the match itself is inherently positive — no red/green gradient).
 */

import * as React from 'react';
import { cn, clamp01 } from '@/lib/utils';

export interface RingProps {
  /** 0..1, clamped. */
  value: number;
  /** Outer diameter in px. Default 22. */
  size?: number;
  /** Stroke width in px. Default 2.5. */
  strokeWidth?: number;
  /** Tailwind text-* class that sets the progress stroke via currentColor. */
  className?: string;
  /** Track class (unfilled portion). */
  trackClassName?: string;
  /** Optional content rendered inside the ring (e.g., "%"). */
  children?: React.ReactNode;
}

export function Ring({
  value,
  size = 22,
  strokeWidth = 2.5,
  className,
  trackClassName,
  children,
}: RingProps) {
  const clamped = clamp01(value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <span
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={cn('stroke-border/60', trackClassName)}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {children != null && (
        <span className="absolute inset-0 flex items-center justify-center">
          {children}
        </span>
      )}
    </span>
  );
}

/**
 * PercentRing — uniform `text-metric-positive` tint. Use for match-strength
 * / quality displays where there's no "bad" state to distinguish.
 */
export function PercentRing({ className, ...rest }: RingProps) {
  return <Ring className={cn('text-metric-positive', className)} {...rest} />;
}
