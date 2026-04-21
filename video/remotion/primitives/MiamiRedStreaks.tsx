import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { DIMENSIONS } from "../../config/layout";
import { INSTITUTIONAL } from "../../config/themes";

/**
 * One-shot Miami-red streak overlay for the TitleSlide.
 *
 * Five streaks sweep diagonally across the canvas during the logo reveal
 * (roughly frames 15-265) and wash away before the 9-second hold settles,
 * leaving a clean background for the remaining runtime.
 *
 * Adapted from `frontend/src/components/ui/shooting-stars.tsx` (the app's
 * home-screen effect) with two important differences:
 *
 *   1. Fully deterministic — every streak's position, opacity, and scale at
 *      any frame is a pure function of `useCurrentFrame()`. No Math.random,
 *      no rAF, no useState. Preserves Remotion Studio seeking and guarantees
 *      byte-identical frame renders.
 *   2. "Punctuation, not storm" — a hard-coded five-streak schedule. The app
 *      runs streaks continuously; on the title slide they're a finite burst.
 */

const STREAK_WIDTH_PX = 10;
const STREAK_HEIGHT_PX = 1;
const SPAWN_FADE_FRAMES = 4;
const CULL_MARGIN_PX = 20;
const GLOW_STD_DEVIATION = 1.5;

const W = DIMENSIONS.landscape.width; // 1920
const H = DIMENSIONS.landscape.height; // 1080

export type StreakSchedule = {
  /** Frame at which this streak spawns at its anchor. */
  spawnFrame: number;
  /** Travel angle in degrees (0 = right, 90 = down, clockwise). */
  angleDeg: number;
  /** Pixels moved per frame. */
  speed: number;
  /** Spawn position on a canvas edge. */
  anchor: { x: number; y: number };
};

export type StreakState = {
  x: number;
  y: number;
  angleDeg: number;
  scaleX: number;
  opacity: number;
};

/**
 * Default choreography — five streaks, ~4.4 seconds of activity, then silence.
 *
 * Anchors are set relative to the 1920×1080 canvas. Angles follow the screen
 * convention (0 = right, 90 = down, clockwise), matching the app's
 * `shooting-stars.tsx`. Each streak exits the canvas via its natural linear
 * trajectory; `computeStreak` returns null once it does.
 *
 * Expected last-null frame (pre-computed): ~264. Frames 265-540 are clean.
 */
export const DEFAULT_STREAKS: readonly StreakSchedule[] = [
  { spawnFrame: 15, angleDeg: 135, speed: 11, anchor: { x: 0.78 * W, y: 0 } },
  { spawnFrame: 40, angleDeg: 315, speed: 13, anchor: { x: 0, y: 0.65 * H } },
  { spawnFrame: 70, angleDeg: 45, speed: 13, anchor: { x: 0.22 * W, y: 0 } },
  { spawnFrame: 115, angleDeg: 225, speed: 15, anchor: { x: W, y: 0.55 * H } },
  { spawnFrame: 160, angleDeg: 225, speed: 15, anchor: { x: 0.78 * W, y: H } },
];

/**
 * Pure keyframe calculator for a single streak. Exported so keyframe
 * arithmetic can be verified without spinning up Remotion.
 *
 * Returns `null` when the streak hasn't spawned yet (frame < spawnFrame) or
 * has exited the canvas by more than `margin` pixels.
 */
export const computeStreak = (
  frame: number,
  streak: StreakSchedule,
  canvasWidth: number = W,
  canvasHeight: number = H,
  margin: number = CULL_MARGIN_PX,
): StreakState | null => {
  const age = frame - streak.spawnFrame;
  if (age < 0) return null;

  const rad = (streak.angleDeg * Math.PI) / 180;
  const travel = age * streak.speed;
  const x = streak.anchor.x + travel * Math.cos(rad);
  const y = streak.anchor.y + travel * Math.sin(rad);

  if (
    x < -margin ||
    x > canvasWidth + margin ||
    y < -margin ||
    y > canvasHeight + margin
  ) {
    return null;
  }

  const opacity = Math.min(1, age / SPAWN_FADE_FRAMES);
  const scaleX = 1 + travel / 100;

  return { x, y, angleDeg: streak.angleDeg, scaleX, opacity };
};

export type MiamiRedStreaksProps = {
  /** Override the default five-streak schedule. */
  streaks?: readonly StreakSchedule[];
};

/**
 * Full-canvas SVG overlay. Renders one `<rect>` per active streak with a
 * shared gaussian-blur glow filter and a shared tail→head gradient. All
 * rects paint into a single `<svg>` to keep the render tree flat.
 */
export const MiamiRedStreaks: React.FC<MiamiRedStreaksProps> = ({
  streaks = DEFAULT_STREAKS,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const active = streaks
    .map((streak, i) => {
      const state = computeStreak(frame, streak, width, height);
      return state === null ? null : { state, i };
    })
    .filter((entry): entry is { state: StreakState; i: number } => entry !== null);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block" }}
      >
        <defs>
          <filter
            id="miami-streak-glow"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation={GLOW_STD_DEVIATION} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient
            id="miami-streak-gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop
              offset="0%"
              stopColor={INSTITUTIONAL.MIAMI_RED}
              stopOpacity="0"
            />
            <stop
              offset="100%"
              stopColor={INSTITUTIONAL.MIAMI_RED}
              stopOpacity="1"
            />
          </linearGradient>
        </defs>
        {active.map(({ state, i }) => {
          const w = STREAK_WIDTH_PX * state.scaleX;
          const cx = state.x + w / 2;
          const cy = state.y + STREAK_HEIGHT_PX / 2;
          return (
            <rect
              key={i}
              x={state.x}
              y={state.y}
              width={w}
              height={STREAK_HEIGHT_PX}
              fill="url(#miami-streak-gradient)"
              filter="url(#miami-streak-glow)"
              opacity={state.opacity}
              transform={`rotate(${state.angleDeg} ${cx} ${cy})`}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
