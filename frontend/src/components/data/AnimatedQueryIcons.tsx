/**
 * AnimatedQueryIcons — Animated SVG icons for the QueryPanel execute buttons.
 *
 * Uses overlapping layered strokes to create a continuous metallic gradient
 * shine that flows along the path contour.
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Trace layer generation
// ---------------------------------------------------------------------------

interface TraceLayer {
  key: number;
  strokeDasharray: string;
  stroke: string;
  strokeOpacity: number;
  animationDelay: string;
}

// Generate the array of overlapping strokes for a smooth continuous gradient tail
function generateTraceLayers(): TraceLayer[] {
  const layers = 20;
  const L_max = 0.5;
  const SUM = 1;

  return Array.from({ length: layers }).map((_, i) => {
    const length = L_max - (i * L_max / layers);
    const shift = L_max - length;

    const ratio = i / (layers - 1);

    // In Light mode, we just want currentColor fading out via opacity.
    // In Dark mode, we want a white-hot head that fades to currentColor and also fades out via opacity.
    // This is cleanly handled purely via CSS variables defined on .execute-icon
    const color = `color-mix(in srgb, currentColor, var(--comet-head-color) calc(var(--comet-head-max) * ${ratio}))`;

    return {
      key: i,
      strokeDasharray: `${length} ${SUM - length}`,
      stroke: color,
      strokeOpacity: ratio,
      animationDelay: `-${(shift / SUM) * 1.5}s`
    };
  });
}

const TRACE_LAYERS = generateTraceLayers();

// ---------------------------------------------------------------------------
// Animated execute icon (lightning bolt)
// ---------------------------------------------------------------------------

interface AnimatedExecuteIconProps {
  isExecuting: boolean;
  colorClassName: string;
}

// Animated lightning bolt icon for execute button.
// Uses perfectly overlapping layered strokes to create a true continuous metallic gradient shine
// that flows precisely along the path contour without opacity blending or fixed-axis defects.
export function AnimatedExecuteIcon({ isExecuting, colorClassName }: AnimatedExecuteIconProps) {
  if (isExecuting) {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }

  const boltPath = 'M13 2L3 14h9l-1 8 10-12h-9l1-8z';

  return (
    <svg
      className={cn('h-4 w-4 shrink-0 execute-icon', colorClassName)}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Base stroke (translucent so the fully opaque shine pops) */}
      <path
        d={boltPath}
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeOpacity="0.3"
        pathLength={1}
      />

      {/* Gradient shimmer: layered traces flow along the path continuously */}
      {TRACE_LAYERS.map((layer) => (
        <path
          key={layer.key}
          d={boltPath}
          fill="none"
          pathLength={1}
          className="execute-icon-trace-base"
          style={{
            stroke: layer.stroke,
            strokeOpacity: layer.strokeOpacity,
            strokeDasharray: layer.strokeDasharray,
            animationDelay: layer.animationDelay
          }}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Animated brain icon (English / NL mode)
// ---------------------------------------------------------------------------

interface AnimatedBrainIconProps {
  colorClassName: string;
}

// Animated brain icon for English mode execute button.
// Uses the exact same gradient tail logic to flow along each stroke.
export function AnimatedBrainIcon({ colorClassName }: AnimatedBrainIconProps) {
  const brainPaths = [
    'M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z',
    'M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z',
    'M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4',
    'M17.599 6.5a3 3 0 0 0 .399-1.375',
    'M6.003 5.125A3 3 0 0 0 6.401 6.5',
    'M3.477 10.896a4 4 0 0 1 .585-.396',
    'M19.938 10.5a4 4 0 0 1 .585.396',
    'M6 18a4 4 0 0 1-1.967-.516',
    'M19.967 17.484A4 4 0 0 1 18 18',
  ];

  return (
    <svg
      className={cn('h-4 w-4 shrink-0 execute-icon', colorClassName)}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Base strokes (translucent so the fully opaque shine pops) */}
      <g stroke="currentColor" strokeOpacity="0.3">
        {brainPaths.map((d, i) => (
          <path key={`base-${i}`} d={d} pathLength={1} />
        ))}
      </g>

      {/* Gradient shimmer: layered traces flow along each stroke continuously */}
      <g fill="none">
        {brainPaths.map((d, pathIdx) => (
          <g key={`trace-group-${pathIdx}`}>
            {TRACE_LAYERS.map((layer) => (
              <path
                key={`trace-${pathIdx}-${layer.key}`}
                d={d}
                pathLength={1}
                className="execute-icon-trace-base"
                style={{
                  stroke: layer.stroke,
                  strokeOpacity: layer.strokeOpacity,
                  strokeDasharray: layer.strokeDasharray,
                  animationDelay: layer.animationDelay
                }}
              />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}
