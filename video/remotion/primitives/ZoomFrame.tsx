import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRING_SETTLE } from "../../config/easing";

export type ZoomFrameProps = {
  /** Frame the zoom starts engaging. */
  at: number;
  /** Frame the zoom begins releasing. */
  release: number;
  /** Region to zoom to, in the wrapped child's own coordinate space. */
  region: { x: number; y: number; w: number; h: number };
  /** Target scale. Computed from region if omitted. */
  scale?: number;
  /** Active viewport size for centering math. Defaults to 1920×1080. */
  frameSize?: { width: number; height: number };
  /** Engage/release duration. Default 24 frames (400 ms @ 60 fps). */
  durationFrames?: number;
  children: React.ReactNode;
};

const COMP_WIDTH = 1920;
const COMP_HEIGHT = 1080;
const PADDING_FACTOR = 0.85;

/**
 * Engages a zoom on `region` at `at`, holds, then releases at `release`. The
 * net transform is `scale` * `(engageProgress - releaseProgress)`, meaning
 * the release cleanly cancels the engage. Transform origin is the composition
 * center (960, 540) with the region's center translated into view.
 */
export const ZoomFrame: React.FC<ZoomFrameProps> = ({
  at,
  release,
  region,
  scale,
  frameSize,
  durationFrames = 24,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frameWidth = frameSize?.width ?? COMP_WIDTH;
  const frameHeight = frameSize?.height ?? COMP_HEIGHT;

  const targetScale =
    scale ??
    Math.min(frameWidth / region.w, frameHeight / region.h) * PADDING_FACTOR;

  const engage = spring({
    fps,
    frame: frame - at,
    config: SPRING_SETTLE,
    durationInFrames: durationFrames,
  });
  const rel = spring({
    fps,
    frame: frame - release,
    config: SPRING_SETTLE,
    durationInFrames: durationFrames,
  });

  const netProgress = Math.max(0, Math.min(1, engage - rel));
  const s = 1 + (targetScale - 1) * netProgress;

  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const tx = (frameWidth / 2 - cx) * netProgress;
  const ty = (frameHeight / 2 - cy) * netProgress;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translate(${tx}px, ${ty}px) scale(${s})`,
        transformOrigin: `${cx}px ${cy}px`,
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
};
