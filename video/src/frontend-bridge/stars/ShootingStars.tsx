/**
 * Frame-driven replacement for `frontend/src/components/ui/shooting-stars.tsx`.
 * A small pool of diagonal streaks with deterministic birth frames — each
 * streak interpolates position + opacity across a 60-frame lifespan.
 */

import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export interface ShootingStarsProps {
  minSpeed?: number;
  maxSpeed?: number;
  minDelay?: number;
  maxDelay?: number;
  starColor?: string;
  trailColor?: string;
  starWidth?: number;
  starHeight?: number;
  className?: string;
}

const LIFESPAN_FRAMES = 60;
const POOL_SIZE = 6;

interface Streak {
  birth: number;
  x0: number;
  y0: number;
  angle: number;
  speed: number;
}

export const ShootingStars: React.FC<ShootingStarsProps> = ({
  minSpeed = 8,
  maxSpeed = 15,
  starColor = "#ffffff",
  trailColor = "#ffffff",
  starWidth = 10,
  starHeight = 1,
  className,
}) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  const streaks = useMemo<Streak[]>(
    () =>
      Array.from({ length: POOL_SIZE }, (_, i) => {
        const angles = [45, 135, 225, 315];
        return {
          birth: Math.floor(
            (Math.random() * durationInFrames) / POOL_SIZE +
              (i * durationInFrames) / POOL_SIZE,
          ),
          x0: Math.random() * width,
          y0: Math.random() * height,
          angle: angles[i % angles.length] ?? 45,
          speed: Math.random() * (maxSpeed - minSpeed) + minSpeed,
        };
      }),
    [width, height, durationInFrames, minSpeed, maxSpeed],
  );

  return (
    <AbsoluteFill
      className={className}
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    >
      <svg width={width} height={height} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="shooting-trail" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={trailColor} stopOpacity="0" />
            <stop offset="100%" stopColor={starColor} stopOpacity="1" />
          </linearGradient>
        </defs>
        {streaks.map((s, i) => {
          const age = frame - s.birth;
          if (age < 0 || age > LIFESPAN_FRAMES) return null;
          const rad = (s.angle * Math.PI) / 180;
          const x = s.x0 + Math.cos(rad) * s.speed * age;
          const y = s.y0 + Math.sin(rad) * s.speed * age;
          const opacity = interpolate(
            age,
            [0, LIFESPAN_FRAMES * 0.2, LIFESPAN_FRAMES],
            [0, 1, 0],
          );
          const scale = 1 + (age * s.speed) / 100;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={starWidth * scale}
              height={starHeight}
              fill="url(#shooting-trail)"
              opacity={opacity}
              transform={`rotate(${s.angle}, ${x}, ${y})`}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
