import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { EASE_OUT, SPRING_HERO } from "../../config/easing";
import type { Theme } from "../../config/themes";
import { COLORS } from "../../config/themes";

export type AnimatedLogoMarkProps = {
  /** Size in px (width & height; the mark is square). */
  size: number;
  /** Delay in frames before the draw sequence begins. Default 0. */
  delay?: number;
  /** Override stroke + fill color. Defaults to `COLORS[theme].WORD_COLOR_ON_BG_APPEARED`. */
  color?: string;
  theme: Theme;
  /** "draw" = full animation; "static" = pre-drawn chrome (no animation). Default "draw". */
  mode?: "draw" | "static";
};

/** Per-element draw durations (frames) for the sequential animation.
 *  Tightened ~2× from the original 24/24/24/10 — the original felt syrupy. */
const LEG_FRAMES = 12;
const CROSSBAR_FRAMES = 12;
const RIGHT_LEG_FRAMES = 12;
const APEX_FRAMES = 6;

/** Right leg is held at 40% opacity throughout (matches source SVG). */
const RIGHT_LEG_OPACITY = 0.4;

/**
 * Compute a normalized (0..1 with pathLength=1) stroke-dashoffset given a
 * frame-window and the current frame. Mirrors the frontend's `.stroke-draw-on`
 * pattern — dashoffset animates length → 0 as `progress` goes 0 → 1.
 */
const computeDrawOffset = (
  frame: number,
  start: number,
  durationFrames: number,
  isStatic: boolean,
): number => {
  if (isStatic) return 0;
  return interpolate(frame, [start, start + durationFrames], [1, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

/**
 * Product "A" mark, with a sequential stroke-draw animation plus a spring
 * scale-in for the apex circle. Paths inlined from `docs/branding/readme.svg`
 * (lines 22–27); the viewBox is normalized to 0 0 32 32.
 *
 * Draw sequence (mode="draw", timings relative to `delay`):
 *   - 0..12:  Left leg draws in (EASE_OUT)
 *   - 12..24: Crossbar draws in (EASE_OUT)
 *   - 24..36: Right leg draws in (EASE_OUT), held at 40% opacity
 *   - 36..42: Apex circle scales 0→1 via SPRING_HERO + opacity 0→1
 *
 * Static mode renders everything fully visible with no animation.
 */
export const AnimatedLogoMark: React.FC<AnimatedLogoMarkProps> = ({
  size,
  delay = 0,
  color,
  theme,
  mode = "draw",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const strokeColor = color ?? COLORS[theme].WORD_COLOR_ON_BG_APPEARED;
  const isStatic = mode === "static";

  const leftLegStart = delay;
  const crossbarStart = delay + LEG_FRAMES;
  const rightLegStart = delay + LEG_FRAMES + CROSSBAR_FRAMES;
  const apexStart = delay + LEG_FRAMES + CROSSBAR_FRAMES + RIGHT_LEG_FRAMES;

  const leftLegOffset = computeDrawOffset(frame, leftLegStart, LEG_FRAMES, isStatic);
  const crossbarOffset = computeDrawOffset(frame, crossbarStart, CROSSBAR_FRAMES, isStatic);
  const rightLegOffset = computeDrawOffset(frame, rightLegStart, RIGHT_LEG_FRAMES, isStatic);

  const apexProgress = isStatic
    ? 1
    : spring({
        fps,
        frame: frame - apexStart,
        config: SPRING_HERO,
        durationInFrames: APEX_FRAMES,
      });
  const apexScale = interpolate(apexProgress, [0, 1], [0, 1]);
  const apexOpacity = interpolate(apexProgress, [0, 1], [0, 1]);

  // `pathLength={1}` + `strokeDasharray={1}` lets us drive the draw in a
  // normalized 0..1 space — same trick as the app's `.stroke-draw-on` utility.
  const commonStrokeProps = {
    stroke: strokeColor,
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    pathLength: 1,
    strokeDasharray: 1,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M14 8L5 26" {...commonStrokeProps} strokeDashoffset={leftLegOffset} />
      <path d="M9 18H19.5" {...commonStrokeProps} strokeDashoffset={crossbarOffset} />
      <path
        d="M18 8L27 26"
        {...commonStrokeProps}
        opacity={RIGHT_LEG_OPACITY}
        strokeDashoffset={rightLegOffset}
      />
      <circle
        cx={16}
        cy={4}
        r={3}
        fill={strokeColor}
        opacity={apexOpacity}
        style={{
          transform: `scale(${apexScale})`,
          transformOrigin: "16px 4px",
        }}
      />
    </svg>
  );
};
