import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SPRING_HERO } from "../../config/easing";

export type ScaleInNumberProps = {
  /** Final rendered string (e.g. "80%", "1.2M", "42 days"). */
  value: string;
  /** Frames to wait before animation starts. Default 0. */
  delay?: number;
  /** Override spring duration in frames. Default ~24. */
  durationInFrames?: number;
  style?: React.CSSProperties;
};

/** Spring duration target — ~400ms @60fps. */
const DEFAULT_DURATION_FRAMES = 24;
/** Scale endpoints — starts squashed, settles at 1.0. */
const SCALE_FROM = 0.6;
const SCALE_TO = 1.0;

/**
 * Renders a final number in place, scaling from 0.6 → 1.0 with a parallel
 * opacity fade, driven by `SPRING_HERO` (the emphasis spring).
 *
 * Limit to one hero-scale primitive per slide — overuse flattens emphasis.
 */
export const ScaleInNumber: React.FC<ScaleInNumberProps> = ({
  value,
  delay = 0,
  durationInFrames = DEFAULT_DURATION_FRAMES,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    fps,
    frame: frame - delay,
    config: SPRING_HERO,
    durationInFrames,
  });
  const scale = interpolate(progress, [0, 1], [SCALE_FROM, SCALE_TO]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return (
    <span
      style={{
        ...style,
        display: "inline-block",
        transform: `scale(${scale})`,
        transformOrigin: "center",
        opacity,
      }}
    >
      {value}
    </span>
  );
};
