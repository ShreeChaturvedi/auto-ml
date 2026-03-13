import { cn } from '@/lib/utils';

interface WaveformIconProps {
  className?: string;
  /** When true, bars use CSS custom properties --bar-0..--bar-4 for scaleY (driven by AnalyserNode) */
  live?: boolean;
}

const BAR_COUNT = 5;
const BAR_HEIGHTS = [0.5, 0.7, 1, 0.7, 0.5]; // idle proportions
const BAR_DELAYS = [0, 80, 160, 80, 0]; // symmetric stagger for dance animation

/**
 * SVG waveform icon with 5 vertical bars.
 * - Idle: CSS keyframe "dance" animation on hover
 * - Live recording: JS-driven scaleY via CSS custom properties
 */
export function WaveformIcon({ className, live }: WaveformIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn('h-4 w-4', className)}
      aria-hidden="true"
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const x = 1.1 + i * 3;
        const baseHeight = BAR_HEIGHTS[i] * 10;
        const y = 8 - baseHeight / 2;

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={1.8}
            height={baseHeight}
            rx={0.9}
            fill="currentColor"
            className={live ? undefined : 'waveform-bar'}
            style={
              live
                ? {
                    transformOrigin: `${x + 0.9}px 8px`,
                    transform: `scaleY(var(--bar-${i}, 1))`,
                    transition: 'transform 80ms ease-out',
                  }
                : {
                    transformOrigin: `${x + 0.9}px 8px`,
                    animationDelay: `${BAR_DELAYS[i]}ms`,
                  }
            }
          />
        );
      })}
    </svg>
  );
}
