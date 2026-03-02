/**
 * ShootingStars
 *
 * Renders SVG shooting stars that streak across the parent container.
 * Adapted from Aceternity UI (https://ui.aceternity.com/components/shooting-stars-and-stars-background).
 *
 * Key improvements over the upstream implementation:
 *  - Container-relative sizing via ResizeObserver (not window dimensions)
 *  - `absolute` positioning so it clips to the parent (not fixed viewport)
 *  - Spawn timer fully cleaned up on unmount — no timeout leaks
 *  - Stable gradient ID tied to each star's lifetime
 *  - No external animation dependencies (pure React + rAF)
 *
 * Parent requirements: `position: relative | absolute | fixed` + `overflow: hidden`
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Internal representation of an active shooting star. */
interface ShootingStar {
  /** Unique ID used to key the SVG element and gradient. */
  id: number;
  /** Current x position in container pixels. */
  x: number;
  /** Current y position in container pixels. */
  y: number;
  /** Travel angle in degrees (0 = right, 90 = down, clockwise). */
  angle: number;
  /** Scale multiplier — grows as the star travels for a perspective effect. */
  scale: number;
  /** Pixels moved per animation frame. */
  speed: number;
  /** Cumulative pixels traveled (drives the scale growth). */
  distance: number;
}

export interface ShootingStarsProps {
  /** Minimum travel speed in pixels per frame. @default 4 */
  minSpeed?: number;
  /** Maximum travel speed in pixels per frame. @default 15 */
  maxSpeed?: number;
  /** Minimum delay between consecutive star spawns in milliseconds. @default 1200 */
  minDelay?: number;
  /** Maximum delay between consecutive star spawns in milliseconds. @default 4200 */
  maxDelay?: number;
  /** CSS color of the star head. @default 'currentColor' */
  starColor?: string;
  /** CSS color at the start of the trailing gradient. @default 'currentColor' */
  trailColor?: string;
  /** Rendered width of the star element in pixels (scales up during travel). @default 10 */
  starWidth?: number;
  /** Rendered height of the star element in pixels. @default 1 */
  starHeight?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick a random spawn point on one of the four container edges together with
 * a diagonal travel angle so the star always crosses toward the opposite region.
 */
function randomEdgeOrigin(
  width: number,
  height: number,
): { x: number; y: number; angle: number } {
  const side = Math.floor(Math.random() * 4);
  const t = Math.random();

  switch (side) {
    case 0:
      return { x: t * width, y: 0, angle: 45 };        // top    → down-right
    case 1:
      return { x: width, y: t * height, angle: 135 };   // right  → down-left
    case 2:
      return { x: t * width, y: height, angle: 225 };   // bottom → up-left
    default:
      return { x: 0, y: t * height, angle: 315 };       // left   → up-right
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShootingStars({
  minSpeed = 4,
  maxSpeed = 15,
  minDelay = 1200,
  maxDelay = 4200,
  starColor = 'currentColor',
  trailColor = 'currentColor',
  starWidth = 10,
  starHeight = 1,
  className,
}: ShootingStarsProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [star, setStar] = useState<ShootingStar | null>(null);

  /** Monotonically increasing ID so each star gets a unique gradient element. */
  const idCounterRef = useRef(0);
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // ---------------------------------------------------------------------------
  // Effect 1 — Track container dimensions via ResizeObserver on the SVG itself.
  //            The SVG fills the container (`absolute inset-0 h-full w-full`)
  //            so its content box is exactly the container's inner dimensions.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    });

    observer.observe(svg);

    // Seed initial size synchronously so the first spawn has real values.
    const rect = svg.getBoundingClientRect();
    setContainerSize({ width: rect.width, height: rect.height });

    return () => observer.disconnect();
  }, []);

  // ---------------------------------------------------------------------------
  // Effect 2 — Reactive spawn: schedules a new star only after the previous one
  //            has exited bounds (star === null).  This guarantees a star is
  //            never replaced mid-flight, eliminating the abrupt-disappearance
  //            bug caused by the old self-scheduling timer.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const { width, height } = containerSize;
    if (width === 0 || height === 0) return;
    if (star !== null) return; // star still in flight — wait for it to exit

    const delay = Math.random() * (maxDelay - minDelay) + minDelay;

    spawnTimerRef.current = setTimeout(() => {
      const { x, y, angle } = randomEdgeOrigin(width, height);
      const speed = Math.random() * (maxSpeed - minSpeed) + minSpeed;

      setStar({
        id: ++idCounterRef.current,
        x,
        y,
        angle,
        speed,
        scale: 1,
        distance: 0,
      });
    }, delay);

    return () => {
      if (spawnTimerRef.current !== null) {
        clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
      }
    };
  }, [star, containerSize.width, containerSize.height, minSpeed, maxSpeed, minDelay, maxDelay]);

  // ---------------------------------------------------------------------------
  // Effect 3 — requestAnimationFrame movement loop.
  //            Uses `setStar(prev => ...)` functional updates so the loop never
  //            closes over stale star state — it restarts only when the
  //            container is resized so that bounds checking stays accurate.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const { width, height } = containerSize;

    const moveStar = () => {
      setStar((prev) => {
        if (!prev) return null;

        const rad = (prev.angle * Math.PI) / 180;
        const newX = prev.x + prev.speed * Math.cos(rad);
        const newY = prev.y + prev.speed * Math.sin(rad);
        const newDistance = prev.distance + prev.speed;

        // Cull the star once it has left the container with a small margin to
        // avoid a hard pop-out at the edge.
        const margin = 20;
        if (
          newX < -margin ||
          newX > width + margin ||
          newY < -margin ||
          newY > height + margin
        ) {
          return null;
        }

        return {
          ...prev,
          x: newX,
          y: newY,
          distance: newDistance,
          // Grow the star slightly as it travels — gives a sense of depth.
          scale: 1 + newDistance / 100,
        };
      });

      rafRef.current = requestAnimationFrame(moveStar);
    };

    rafRef.current = requestAnimationFrame(moveStar);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [containerSize.width, containerSize.height]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Stable gradient ID for the lifetime of the current star.
  const gradientId = `shooting-star-trail-${idCounterRef.current}`;

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full',
        className,
      )}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="shooting-star-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {star !== null && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={trailColor} stopOpacity="0" />
              <stop offset="100%" stopColor={starColor} stopOpacity="1" />
            </linearGradient>
          </defs>
          <rect
            key={star.id}
            x={star.x}
            y={star.y}
            width={starWidth * star.scale}
            height={starHeight}
            fill={`url(#${gradientId})`}
            filter="url(#shooting-star-glow)"
            transform={`rotate(${star.angle}, ${star.x + (starWidth * star.scale) / 2}, ${
              star.y + starHeight / 2
            })`}
          />
        </>
      )}
    </svg>
  );
}
