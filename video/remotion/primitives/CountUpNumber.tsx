import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { EasingFunction } from "remotion";
import { EASE_OUT } from "../../config/easing";

export type CountUpNumberProps = {
  /** Starting numeric value. Default 0. */
  from?: number;
  /** Target numeric value the count-up lands on. Default 80. */
  to?: number;
  /**
   * Formatter applied to the interpolated numeric value every frame.
   * Default rounds and appends a percent sign: `80 → "80%"`.
   */
  format?: (value: number) => string;
  /** Frames to wait before the count-up begins. Default 0. */
  delay?: number;
  /** Ramp duration in frames. Default 36 (~600ms @60fps). */
  durationInFrames?: number;
  /** Easing curve for the ramp. Default `EASE_OUT` (front-loaded). */
  easing?: EasingFunction;
  style?: React.CSSProperties;
};

const DEFAULT_DURATION_FRAMES = 36;

/**
 * Frame-driven numeric count-up. The ramp is pure `interpolate` — deterministic
 * and seekable, no spring overshoot — so the landing frame always reads
 * exactly as `format(to)` without jitter.
 *
 * Glyph stability: hero numerals at 220px will horizontally reflow as digits
 * change width ("08%" → "11%" is wider than "80%"). Two safeguards:
 *   1. `fontVariantNumeric: "tabular-nums"` forces equal-width digits.
 *   2. A hidden phantom sibling rendering the final string reserves the
 *      settled glyph box; the animating span is absolutely positioned inside
 *      that box so the parent layout never shifts as the value updates.
 *
 * Prefer this over `ScaleInNumber` for hero statistics — count-up reads as
 * data-driven rather than decorative.
 */
export const CountUpNumber: React.FC<CountUpNumberProps> = ({
  from = 0,
  to = 80,
  format = (n) => `${Math.round(n)}%`,
  delay = 0,
  durationInFrames = DEFAULT_DURATION_FRAMES,
  easing = EASE_OUT,
  style,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(
    frame,
    [delay, delay + durationInFrames],
    [0, 1],
    {
      easing,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const value = from + (to - from) * progress;
  const finalText = format(to);
  const currentText = format(value);

  return (
    <span
      style={{
        ...style,
        position: "relative",
        display: "inline-block",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {/* Phantom sibling — reserves the final glyph box so the parent line
       *  cannot reflow as digits tick. `visibility: hidden` keeps the box
       *  present for layout but unpainted. */}
      <span aria-hidden style={{ visibility: "hidden" }}>
        {finalText}
      </span>
      {/* Animating glyph — absolutely positioned inside the reserved box so
       *  its width changes never move neighbors. */}
      <span
        style={{
          position: "absolute",
          inset: 0,
          textAlign: "center",
        }}
      >
        {currentText}
      </span>
    </span>
  );
};
