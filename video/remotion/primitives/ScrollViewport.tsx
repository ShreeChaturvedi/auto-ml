import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

export type ScrollKeyframe = {
  /** Absolute frame (caller resolves marks before passing). */
  at: number;
  /** Scroll offset in px (positive = child moves up). */
  y: number;
};

export type ScrollViewportProps = {
  keyframes: readonly ScrollKeyframe[];
  children: React.ReactNode;
  /** Easing for segment transitions (passed to Remotion's interpolate `easing`
   * option). Default matches --ease-out-quart (bezier(0.25, 1, 0.5, 1)). */
  easing?: (t: number) => number;
};

const DEFAULT_EASING = Easing.bezier(0.25, 1, 0.5, 1);

/**
 * Smooth keyframe-driven scrolling viewport. Renders an `AbsoluteFill` with
 * `overflow: hidden` and translates the inner child by `-y(frame)` where `y`
 * is interpolated across the supplied keyframes.
 */
export const ScrollViewport: React.FC<ScrollViewportProps> = ({
  keyframes,
  children,
  easing = DEFAULT_EASING,
}) => {
  const frame = useCurrentFrame();

  // Empty / single-keyframe degenerate cases.
  const y =
    keyframes.length === 0
      ? 0
      : keyframes.length === 1
        ? keyframes[0]!.y
        : interpolate(
            frame,
            keyframes.map((k) => k.at),
            keyframes.map((k) => k.y),
            {
              easing,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateY(${-y}px)`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
