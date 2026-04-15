import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRING_HERO, SPRING_SETTLE, SPRING_UI } from "../../config/easing";

export type MorphBoxStyle = {
  background?: string;
  borderRadius?: number | string;
  boxShadow?: string;
  border?: string;
};

export type BBox = { x: number; y: number; w: number; h: number };

export type MorphBoxProps = {
  sourceBbox: BBox;
  destBbox: BBox;
  sourceStyle: MorphBoxStyle;
  destStyle: MorphBoxStyle;
  /** Absolute frame at which the morph begins. */
  start: number;
  /** Frames the morph takes (default 24). */
  duration?: number;
  spring?: "SPRING_UI" | "SPRING_SETTLE" | "SPRING_HERO";
  /** Optional content rendered inside the morphing box (fades in at midpoint). */
  children?: React.ReactNode;
};

const SPRING_CONFIGS = {
  SPRING_UI,
  SPRING_SETTLE,
  SPRING_HERO,
} as const;

/**
 * Shared-element transition between two bounding boxes. Position and size
 * interpolate linearly through the spring progress, while stylistic props
 * (background, boxShadow, border) crossfade via stacked layers so mixed-type
 * CSS values (strings) survive the morph without string math.
 *
 * `borderRadius` interpolates numerically when both endpoints are numbers;
 * otherwise it falls back to the crossfade.
 */
export const MorphBox: React.FC<MorphBoxProps> = ({
  sourceBbox,
  destBbox,
  sourceStyle,
  destStyle,
  start,
  duration = 24,
  spring: springName = "SPRING_UI",
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rawProgress = spring({
    fps,
    frame: frame - start,
    config: SPRING_CONFIGS[springName],
    durationInFrames: duration,
  });
  const progress = Math.max(0, Math.min(1, rawProgress));

  const x = interpolate(progress, [0, 1], [sourceBbox.x, destBbox.x]);
  const y = interpolate(progress, [0, 1], [sourceBbox.y, destBbox.y]);
  const w = interpolate(progress, [0, 1], [sourceBbox.w, destBbox.w]);
  const h = interpolate(progress, [0, 1], [sourceBbox.h, destBbox.h]);

  // Numeric radius interpolates cleanly. Otherwise the two layers crossfade.
  const numericRadius =
    typeof sourceStyle.borderRadius === "number" &&
    typeof destStyle.borderRadius === "number"
      ? interpolate(
          progress,
          [0, 1],
          [sourceStyle.borderRadius, destStyle.borderRadius],
        )
      : undefined;

  const childOpacity = interpolate(progress, [0.5, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const baseLayer: React.CSSProperties = {
    position: "absolute",
    inset: 0,
  };

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: numericRadius,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          ...baseLayer,
          opacity: 1 - progress,
          background: sourceStyle.background,
          boxShadow: sourceStyle.boxShadow,
          border: sourceStyle.border,
          borderRadius:
            numericRadius !== undefined ? numericRadius : sourceStyle.borderRadius,
        }}
      />
      <div
        style={{
          ...baseLayer,
          opacity: progress,
          background: destStyle.background,
          boxShadow: destStyle.boxShadow,
          border: destStyle.border,
          borderRadius:
            numericRadius !== undefined ? numericRadius : destStyle.borderRadius,
        }}
      />
      {children ? (
        <div style={{ ...baseLayer, opacity: childOpacity }}>{children}</div>
      ) : null}
    </div>
  );
};
