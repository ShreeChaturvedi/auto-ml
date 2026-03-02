/**
 * StarsBackground
 *
 * Renders a twinkling star field onto an HTML5 Canvas that fills its parent.
 * Adapted from Aceternity UI (https://ui.aceternity.com/components/shooting-stars-and-stars-background).
 *
 * Key details:
 *  - Canvas-based rendering — no React state updates per frame, fully GPU-composited
 *  - ResizeObserver regenerates the star field whenever the container resizes
 *  - Twinkle effect is achieved via a simple sin(time) opacity modulation
 *  - No external animation dependencies (pure React + rAF)
 *
 * Parent requirements: `position: relative | absolute | fixed` so that the
 * canvas (`absolute inset-0`) sits in the correct stacking context.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Internal representation of a single star on the canvas. */
interface Star {
  x: number;
  y: number;
  /** Circle radius in canvas pixels. */
  radius: number;
  /** Base opacity (0–1). Used directly for non-twinkling stars. */
  opacity: number;
  /**
   * Period in seconds for one full twinkle cycle, or `null` for steady stars.
   * Drives the sin() modulation in the render loop.
   */
  twinkleSpeed: number | null;
  /** Horizontal drift velocity. */
  vx: number;
  /** Vertical drift velocity. */
  vy: number;
}

export interface StarsBackgroundProps {
  /**
   * Stars per square pixel.  Controls overall visual density.
   * Lower = sparser sky; higher = dense starfield. @default 0.00015
   */
  starDensity?: number;
  /** Whether eligible stars can twinkle. @default true */
  allStarsTwinkle?: boolean;
  /**
   * Probability [0–1] that any individual star is assigned a twinkle animation.
   * Only applies when `allStarsTwinkle` is true. @default 0.7
   */
  twinkleProbability?: number;
  /** Minimum twinkle cycle duration in seconds. @default 0.5 */
  minTwinkleSpeed?: number;
  /** Maximum twinkle cycle duration in seconds. @default 1.0 */
  maxTwinkleSpeed?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StarsBackground({
  starDensity = 0.00015,
  allStarsTwinkle = true,
  twinkleProbability = 0.7,
  minTwinkleSpeed = 0.5,
  maxTwinkleSpeed = 1.0,
  className,
}: StarsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stars, setStars] = useState<Star[]>([]);
  const { theme } = useTheme();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  // ---------------------------------------------------------------------------
  // Resolve active theme logic
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      setResolvedTheme(media.matches ? 'dark' : 'light');

      const listener = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  // ---------------------------------------------------------------------------
  // generateStars — memoised so ResizeObserver can call it without stale closures
  // ---------------------------------------------------------------------------
  const generateStars = useCallback(
    (width: number, height: number): Star[] => {
      const count = Math.floor(width * height * starDensity);

      return Array.from({ length: count }, () => {
        const shouldTwinkle =
          allStarsTwinkle && Math.random() < twinkleProbability;

        return {
          x: Math.random() * width,
          y: Math.random() * height,
          // Slightly bigger radius for better visibility
          radius: Math.random() * 0.8 + 0.8,
          opacity: Math.random() * 0.5 + 0.5,
          twinkleSpeed: shouldTwinkle
            ? Math.random() * (maxTwinkleSpeed - minTwinkleSpeed) + minTwinkleSpeed
            : null,
          vx: (Math.random() - 0.5) * 0.15, // horizontal drift
          vy: (Math.random() - 0.5) * 0.15, // vertical drift
        };
      });
    },
    [allStarsTwinkle, twinkleProbability, minTwinkleSpeed, maxTwinkleSpeed, starDensity],
  );

  // ---------------------------------------------------------------------------
  // Effect 1 — Size canvas and regenerate stars on container resize.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      canvas.width = rect.width;
      canvas.height = rect.height;
      setStars(generateStars(rect.width, rect.height));
    });

    observer.observe(canvas);

    // Seed with current layout size immediately (before first observer callback).
    const initialWidth = canvas.clientWidth;
    const initialHeight = canvas.clientHeight;
    if (initialWidth > 0 && initialHeight > 0) {
      canvas.width = initialWidth;
      canvas.height = initialHeight;
      setStars(generateStars(initialWidth, initialHeight));
    }

    return () => observer.disconnect();
  }, [generateStars]);

  // ---------------------------------------------------------------------------
  // Effect 2 — Canvas render loop via requestAnimationFrame.
  //            Reads `stars` (stable between resizes) and `Date.now()` for
  //            twinkle phase — no React state is mutated per frame.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const rgbPrefix = resolvedTheme === 'light' ? '0, 0, 0' : '255, 255, 255';
      const now = Date.now();

      for (const star of stars) {
        // Subtle drift animation
        star.x += star.vx;
        star.y += star.vy;

        // Wrap around canvas edges
        if (star.x < 0) star.x = canvas.width;
        else if (star.x > canvas.width) star.x = 0;
        
        if (star.y < 0) star.y = canvas.height;
        else if (star.y > canvas.height) star.y = 0;

        // Twinkle effects: opacity + slight radius pulse
        const isTwinkling = star.twinkleSpeed !== null;
        let opacity = star.opacity;
        let radius = star.radius;

        if (isTwinkling) {
          const cyclePhase = (now * 0.001) / star.twinkleSpeed;
          // opacity between 0.3 and 1.0 based on sin wave
          opacity = 0.65 + 0.35 * Math.sin(cyclePhase);
          // radius pulses slightly with the twinkle (up to +30%)
          radius = star.radius * (1 + 0.3 * Math.sin(cyclePhase));
        }

        ctx.beginPath();
        ctx.arc(star.x, star.y, Math.max(0.1, radius), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgbPrefix}, ${opacity.toFixed(3)})`;
        ctx.fill();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(rafId);
  }, [stars, resolvedTheme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full',
        className,
      )}
    />
  );
}
