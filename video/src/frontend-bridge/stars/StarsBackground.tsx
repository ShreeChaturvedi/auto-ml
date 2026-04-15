/**
 * Frame-driven replacement for `frontend/src/components/ui/stars-background.tsx`.
 * Mirrors the public prop interface exactly — just swaps the canvas+rAF
 * implementation for a pure SVG render keyed off Remotion's frame clock so
 * each frame renders identically on every pass.
 */

import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

export interface StarsBackgroundProps {
  starDensity?: number;
  allStarsTwinkle?: boolean;
  twinkleProbability?: number;
  minTwinkleSpeed?: number;
  maxTwinkleSpeed?: number;
  className?: string;
}

interface StarSpec {
  x: number;
  y: number;
  r: number;
  base: number;
  twinkle: number | null;
  phase: number;
}

export const StarsBackground: React.FC<StarsBackgroundProps> = ({
  starDensity = 0.00015,
  allStarsTwinkle = true,
  twinkleProbability = 0.7,
  minTwinkleSpeed = 0.5,
  maxTwinkleSpeed = 1.0,
  className,
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();

  const stars = useMemo<StarSpec[]>(() => {
    const count = Math.floor(width * height * starDensity);
    return Array.from({ length: count }, () => {
      const twinkling =
        allStarsTwinkle && Math.random() < twinkleProbability;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 0.6 + 0.5,
        base: Math.random() * 0.5 + 0.5,
        twinkle: twinkling
          ? Math.random() * (maxTwinkleSpeed - minTwinkleSpeed) +
            minTwinkleSpeed
          : null,
        phase: Math.random() * Math.PI * 2,
      };
    });
  }, [
    width,
    height,
    starDensity,
    allStarsTwinkle,
    twinkleProbability,
    minTwinkleSpeed,
    maxTwinkleSpeed,
  ]);

  const seconds = frame / fps;

  return (
    <AbsoluteFill
      className={className}
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    >
      <svg width={width} height={height} xmlns="http://www.w3.org/2000/svg">
        {stars.map((s, i) => {
          const opacity =
            s.twinkle === null
              ? s.base
              : 0.65 + 0.35 * Math.sin(seconds / s.twinkle + s.phase);
          return (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill={`rgba(255, 255, 255, ${opacity.toFixed(3)})`}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
