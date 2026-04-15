import React from "react";
import { useCurrentFrame } from "remotion";

export type ClickRippleProps = {
  at: number;
  x: number;
  y: number;
  theme?: "light" | "dark";
  /** Max radius at peak expansion. Default 48. */
  maxRadiusPx?: number;
};

const EXPAND_FRAMES = 12;
const FADE_FRAMES = 6;
const TOTAL_FRAMES = EXPAND_FRAMES + FADE_FRAMES;
const PEAK_OPACITY = 0.4;

/**
 * Pure keyframe calculator for click-ripple visual state. Exported for unit
 * tests so keyframe arithmetic can be verified without spinning up Remotion.
 */
export const computeClickRipple = (
  frame: number,
  at: number,
  maxRadiusPx: number,
): { radius: number; opacity: number; visible: boolean } => {
  const t = frame - at;
  if (t < 0 || t > TOTAL_FRAMES) {
    return { radius: 0, opacity: 0, visible: false };
  }
  if (t <= EXPAND_FRAMES) {
    const p = t / EXPAND_FRAMES;
    return { radius: maxRadiusPx * p, opacity: PEAK_OPACITY * p, visible: true };
  }
  const p = (t - EXPAND_FRAMES) / FADE_FRAMES;
  return {
    radius: maxRadiusPx,
    opacity: PEAK_OPACITY * (1 - p),
    visible: true,
  };
};

/**
 * 300ms @ 60fps expanding-ring click feedback. 12 frames of expand + 6 frames
 * of fade. Theme decides ring color against dark vs light backgrounds.
 */
export const ClickRipple: React.FC<ClickRippleProps> = ({
  at,
  x,
  y,
  theme = "dark",
  maxRadiusPx = 48,
}) => {
  const frame = useCurrentFrame();
  const { radius, opacity, visible } = computeClickRipple(frame, at, maxRadiusPx);
  if (!visible) return null;

  const ringColor =
    theme === "dark" ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.3)";
  const size = radius * 2;

  return (
    <div
      style={{
        position: "absolute",
        left: x - radius,
        top: y - radius,
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${ringColor}`,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};
