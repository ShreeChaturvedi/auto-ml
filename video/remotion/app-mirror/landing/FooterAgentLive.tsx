/**
 * FooterAgentLive — the giant AGENT wordmark from
 * `landing/src/components/Footer.astro`, driven by `<ShimmerMask>`.
 *
 * Pinned near the bottom of the landing scroll viewport. The wordmark is
 * a single SVG stroke-mask shimmer that cycles every 180 f (3 s).
 */
import React from "react";
import { ShimmerMask } from "../../primitives/MetallicShimmer";

export type FooterAgentLiveProps = {
  width: number;
};

export const FooterAgentLive: React.FC<FooterAgentLiveProps> = ({ width }) => {
  // Footer.astro uses a viewBox="0 0 1200 300" SVG. We scale that to the
  // composition width while preserving the aspect ratio.
  const height = Math.round((width / 1200) * 300);

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <ShimmerMask
        text="AGENT"
        width={width}
        height={height}
        fontSize={Math.round(height * 0.95)}
        cycleFrames={180}
      />
    </div>
  );
};
