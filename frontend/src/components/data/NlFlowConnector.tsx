/**
 * NlFlowConnector
 *
 * A vertical SVG connector that bridges the natural-language textarea and the
 * SQL reveal block.  A single stem enters from the top and fans out into three
 * branches (left, centre, right), matching the particle-sweep pattern used in
 * ComputeAnimation.tsx for visual consistency across the app.
 *
 * Each branch renders two layers over the same cubic-bézier geometry:
 *
 *  1. Base path  – always rendered, uses the border colour.  Fully opaque
 *     while particles are running; dims to 40 % once settled.
 *
 *  2. Particle path – a moving dash that sweeps top-to-bottom along the
 *     base path, using a local linear gradient so it fades in at the entry
 *     point and fades out as it exits.  Visible only in the `active` state.
 *     Each branch has a staggered animation delay for a cascade effect.
 *
 * The `state` prop drives both the visual appearance and the CSS animation:
 *   - 'active'  → particles animate continuously, base paths at full opacity
 *   - 'settled' → particles fade out, base paths dim
 *
 * UID-scoped keyframes are injected via an inline <style> tag, mirroring the
 * pattern used in ComputeAnimation.tsx to avoid global class-name collisions.
 */

import { useId } from 'react';
import { cn } from '@/lib/utils';

interface NlFlowConnectorProps {
  state: 'active' | 'settled';
  className?: string;
}

// ─── SVG geometry ─────────────────────────────────────────────────────────────

const SVG_WIDTH = 120;
const SVG_HEIGHT = 64;
const CX = SVG_WIDTH / 2; // 60 — horizontal midpoint

/**
 * Three cubic-bézier branches fanning out from a shared origin at top-centre.
 * Control points are tuned so the curves feel natural and evenly spaced.
 *
 *   Left   : (60,0) → curves to (18, 64)
 *   Centre : (60,0) → curves to (60, 64)  (near-straight with subtle ease)
 *   Right  : (60,0) → curves to (102,64)
 */
const BRANCHES = [
  // left
  `M ${CX} 0 C ${CX} 22, 18 34, 18 ${SVG_HEIGHT}`,
  // centre
  `M ${CX} 0 C ${CX} 18, ${CX} 46, ${CX} ${SVG_HEIGHT}`,
  // right
  `M ${CX} 0 C ${CX} 22, 102 34, 102 ${SVG_HEIGHT}`,
] as const;

/** Staggered delay per branch so particles cascade rather than firing in sync. */
const BRANCH_DELAYS = ['0s', '0.25s', '0.5s'] as const;

// ─── Component ────────────────────────────────────────────────────────────────

function NlFlowConnector({ state, className }: NlFlowConnectorProps) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, '');

  const gradId = `nl-grad-${uid}`;
  const animName = `nl-particle-${uid}`;

  // Particle dash pattern.  The path length is ~80-100 units depending on the
  // branch curvature.  A 12/90 ratio keeps the dot small and the gap wide
  // enough that you only see one dot at a time per branch.
  const STROKE_DASH = '12 90';
  const OFFSET_START = 110;
  const OFFSET_END = -50;
  const DURATION = '1.4s';

  const isActive = state === 'active';

  return (
    <div
      className={cn('w-full flex items-center justify-center', className)}
      style={{ height: SVG_HEIGHT }}
    >
      <style>{`
        @keyframes ${animName} {
          0%   { stroke-dashoffset: ${OFFSET_START}; }
          100% { stroke-dashoffset: ${OFFSET_END}; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nl-conn-${uid} * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        aria-hidden="true"
        className={`nl-conn-${uid}`}
      >
        <defs>
          {/* Vertical gradient — transparent at ends, opaque at midpoint */}
          <linearGradient
            id={gradId}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%"   style={{ stopColor: 'currentColor', stopOpacity: 0 }} />
            <stop offset="50%"  style={{ stopColor: 'currentColor', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: 'currentColor', stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {BRANCHES.map((d, i) => (
          <g key={i}>
            {/* Base path */}
            <path
              d={d}
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{
                stroke: 'hsl(var(--border))',
                opacity: isActive ? 1 : 0.4,
                transition: 'opacity 0.5s ease',
              }}
            />

            {/* Animated particle */}
            <path
              d={d}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={STROKE_DASH}
              style={{
                opacity: isActive ? 1 : 0,
                transition: 'opacity 0.4s ease',
                animation: `${animName} ${DURATION} linear infinite`,
                animationDelay: BRANCH_DELAYS[i],
              }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

NlFlowConnector.displayName = 'NlFlowConnector';

export { NlFlowConnector };
export type { NlFlowConnectorProps };
