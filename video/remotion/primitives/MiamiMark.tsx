import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../config/easing";

export type MiamiMarkProps = {
  /** Height in px. Width derives from the SVG's intrinsic aspect ratio. */
  size: number;
  /** Final opacity after fade-in (0–1). Default 1. */
  opacity?: number;
  /** Frames to wait before the fade-in starts. Default 0. */
  delay?: number;
};

/** Fade-in duration — 20 frames (~333ms @60fps). Institutional chrome, not decoration. */
const FADE_DURATION_FRAMES = 20;

/**
 * Miami University block-M mark. Loaded via `staticFile("branding/miami-m.svg")`
 * through Remotion's `<Img>` component (ensures the asset is fully decoded
 * before the frame paints).
 *
 * No decorative animation — just a simple opacity fade-in. Institutional
 * logos should not perform.
 */
export const MiamiMark: React.FC<MiamiMarkProps> = ({
  size,
  opacity = 1,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const interpolatedOpacity = interpolate(
    frame,
    [delay, delay + FADE_DURATION_FRAMES],
    [0, opacity],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <Img
      src={staticFile("branding/miami-m.svg")}
      style={{
        height: size,
        width: "auto",
        display: "block",
        opacity: interpolatedOpacity,
      }}
    />
  );
};
