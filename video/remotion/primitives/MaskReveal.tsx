import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../config/easing";

export type MaskRevealProps = {
  children: React.ReactNode;
  /** Frames to wait before sweep starts. Default 0. */
  delay?: number;
  /** Sweep duration in frames. Default 48 (800ms @60fps). */
  durationInFrames?: number;
  /** Sweep direction. Default "right". Only "right" supported in v1. */
  direction?: "right";
  style?: React.CSSProperties;
};

/** Soft edge width (percentage) — prevents the sweep reading as a hard cut. */
const SOFT_EDGE_PCT = 8;

/**
 * Horizontal left-to-right mask sweep via `linear-gradient` applied through
 * `WebkitMaskImage` + `maskImage`. Reuses the `CodeReveal/index.tsx:112-113`
 * technique.
 *
 * Good for an editorially distinct reveal (e.g. Acknowledgements heading).
 * For per-character typing, use `TypeOnText`; for simple fades, `useFadeIn`.
 */
export const MaskReveal: React.FC<MaskRevealProps> = ({
  children,
  delay = 0,
  durationInFrames = 48,
  direction = "right",
  style,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(
    frame,
    [delay, delay + durationInFrames],
    [0, 1],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const hardEdge = progress * 100;
  const softEdge = Math.min(100, hardEdge + SOFT_EDGE_PCT);
  // `direction` reserved for future expansion (v1: right only).
  const gradientDirection = direction === "right" ? "to right" : "to right";
  const maskImage = `linear-gradient(${gradientDirection}, black ${hardEdge}%, transparent ${softEdge}%)`;

  return (
    <div
      style={{
        ...style,
        WebkitMaskImage: maskImage,
        maskImage,
      }}
    >
      {children}
    </div>
  );
};
