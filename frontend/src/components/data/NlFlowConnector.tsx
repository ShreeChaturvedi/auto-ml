/**
 * NlFlowConnector
 *
 * A short vertical SVG connector that bridges the natural-language textarea
 * and the SQL reveal block. It renders two paths over the same geometry:
 *
 *  1. Base path  – always rendered, uses the border color.  Fully opaque
 *     while a particle is running; dims to 40 % after the particle settles.
 *
 *  2. Particle path – a moving dash that sweeps top-to-bottom along the
 *     base path, using a local linear gradient so it fades in at the entry
 *     point and fades out as it exits.  Visible only in the `active` state.
 *
 * The `state` prop drives both the visual appearance and the CSS animation:
 *   - 'active'  → particle animates continuously, base path at full opacity
 *   - 'settled' → particle fades out, base path dims
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

// Connector geometry — a single straight vertical path from top-centre to
// bottom-centre of the SVG viewport.
const SVG_WIDTH = 40;
const SVG_HEIGHT = 40;
const PATH_X = SVG_WIDTH / 2;       // 20 — horizontal mid-line
const PATH_D = `M ${PATH_X} 0 L ${PATH_X} ${SVG_HEIGHT}`;

function NlFlowConnector({ state, className }: NlFlowConnectorProps) {
  const rawId = useId();
  // Strip colons from React's internal id format to produce valid CSS idents.
  const uid = rawId.replace(/:/g, '');

  const gradId = `nl-grad-${uid}`;
  const animName = `nl-particle-${uid}`;

  // Total dash-cycle length: 10 visible + 70 gap = 80. The path length is 40.
  // A stroke-dashoffset of 80 → -40 sweeps the full connector height once.
  const STROKE_DASH = '10 70';
  const OFFSET_START = 80;      // particle starts above the viewport
  const OFFSET_END = -40;       // particle exits below the viewport
  const DURATION = '1.2s';

  const isActive = state === 'active';

  return (
    <div className={cn('h-10 w-full flex items-center justify-center', className)}>
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
          {/*
           * Vertical gradient — transparent at top/bottom, fully opaque at
           * the midpoint — so the particle appears to emerge from and
           * dissolve into the path rather than blinking on/off.
           */}
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

        {/* Base path: full-width connector line */}
        <path
          d={PATH_D}
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
          d={PATH_D}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={STROKE_DASH}
          style={{
            opacity: isActive ? 1 : 0,
            transition: 'opacity 0.4s ease',
            animation: `${animName} ${DURATION} linear infinite`,
          }}
        />
      </svg>
    </div>
  );
}

NlFlowConnector.displayName = 'NlFlowConnector';

export { NlFlowConnector };
export type { NlFlowConnectorProps };
