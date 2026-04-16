import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN, EASE_OUT } from "../../config/easing";

export type FlourishUnderlineProps = {
  /** Frames to wait before the draw-in begins. Default 0. */
  delay?: number;
  /** If true, fade the stroke out from its trailing end after the hold. Default true. */
  drawOut?: boolean;
  /** Stroke color. Default Miami Red `#C41230`. */
  color?: string;
  /** Stroke width in user units (path viewBox is 200×20). Default 2.5. */
  strokeWidth?: number;
  /** CSS width — typically `"100%"` so the flourish matches the parent phrase. */
  width?: number | string;
  /** CSS height of the rendered SVG. Default 18. */
  height?: number | string;
  /**
   * SVG path data in the 200×20 viewBox. Override to use an alternate
   * squiggle shape (e.g. different loop position) so multiple instances on
   * the same slide don't look stamped from one mold. Defaults to the single-
   * loop canonical path (the `lx=127` variant of the app's `generateFlourish`).
   */
  path?: string;
  style?: React.CSSProperties;
};

/**
 * Deterministic, frame-keyed port of the app's `.stroke-draw-on-off` flourish
 * (see `frontend/src/pages/HomePage.tsx` + `frontend/src/styles/ui-utilities.css`
 * keyframes `stroke-on-off`). The randomized path generator in the app is
 * locked to a single canonical path (single-loop variant with `lx=127` and
 * zero jitter) so every render is byte-stable.
 *
 * The animation is three phases driven off `frame - delay`:
 *   - 0  → 40   — draw in (`strokeDashoffset: 1 → 0`, EASE_OUT)
 *   - 40 → 189  — hold (`strokeDashoffset: 0`)
 *   - 189 → 270 — draw out from the trailing end (`0 → -1`, EASE_IN)
 *
 * At `localFrame ≥ 270` the element snaps to `opacity: 0` so no residual
 * stroke lingers after the underline has "released". This mirrors the app's
 * 99.9%/100% keyframe pair on the CSS animation.
 *
 * Pass `drawOut={false}` to hold the underline indefinitely instead of
 * retracting it.
 */

// Single-loop flourish with `lx=127`, jitter=0 — the deterministic variant of
// `generateFlourish()` in HomePage.tsx. ViewBox is 200×20 user units and the
// SVG uses `preserveAspectRatio="none"` so the path stretches to the parent
// phrase width.
export const FLOURISH_PATH_DEFAULT =
  "M 0 14 C 20 18, 45 10, 70 16 " +
  "C 85 18, 100 12, 115 16 " +
  "C 120 17, 124 16, 127 13 " +
  "C 131 3, 135 1, 138 7 " +
  "C 141 13, 136 16, 132 13 " +
  "C 128 10, 132 6, 138 10 " +
  "C 155 14, 182 18, 200 12";

const DRAW_IN_END = 40;
const HOLD_END = 189;
const DRAW_OUT_END = 270;

export const FlourishUnderline: React.FC<FlourishUnderlineProps> = ({
  delay = 0,
  drawOut = true,
  color = "#C41230",
  strokeWidth = 2.5,
  width = "100%",
  height = 18,
  path = FLOURISH_PATH_DEFAULT,
  style,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - delay;

  // `interpolate` can only carry one easing per call — splitting the animation
  // into three piecewise regions lets draw-in (EASE_OUT) and draw-out (EASE_IN)
  // each keep their intended curve.
  let strokeDashoffset: number;
  if (localFrame < DRAW_IN_END) {
    strokeDashoffset = interpolate(
      localFrame,
      [0, DRAW_IN_END],
      [1, 0],
      {
        easing: EASE_OUT,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
  } else if (!drawOut || localFrame < HOLD_END) {
    strokeDashoffset = 0;
  } else {
    strokeDashoffset = interpolate(
      localFrame,
      [HOLD_END, DRAW_OUT_END],
      [0, -1],
      {
        easing: EASE_IN,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
  }

  // Pre-delay + post-draw-out are both opacity: 0 so stray endpoint artifacts
  // (SVG `strokeLinecap="round"` rounds a 1-pixel nub at dasharray boundaries)
  // never show outside the animation's intended window. The tail snap mirrors
  // the CSS keyframes' 99.9% → 100% step.
  let opacity = 1;
  if (localFrame < 0) opacity = 0;
  else if (drawOut && localFrame >= DRAW_OUT_END) opacity = 0;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 20"
      preserveAspectRatio="none"
      style={{ overflow: "visible", opacity, ...style }}
    >
      <path
        d={path}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={1}
        strokeDashoffset={strokeDashoffset}
      />
    </svg>
  );
};
