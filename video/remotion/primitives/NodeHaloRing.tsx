import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../config/easing";
import { ARCH_PALETTE, BREATHE_PERIOD_FRAMES } from "../../config/arch-layout";

// ---------------------------------------------------------------------------
// NodeHaloRing — one-shot pulse. Use to punch the active node or success hit.
// ---------------------------------------------------------------------------

export type NodeHaloRingProps = {
  /** Top-left of the node the halo wraps. */
  x: number;
  y: number;
  /** Node size. */
  w: number;
  h: number;
  /** Corner radius of the wrapped node. Default 12. */
  radius?: number;
  /** Absolute frame the pulse begins. Default 0. */
  at?: number;
  /** Pulse duration. Default 36. */
  durationFrames?: number;
  /** Ring color. Default accent blue. */
  color?: string;
  /** Peak opacity midway through the pulse. Default 0.8. */
  peakOpacity?: number;
  /** Peak scale midway through the pulse. Default 1.25. */
  peakScale?: number;
  /** Ring stroke width. Default 3. */
  strokeWidth?: number;
};

export type NodeHaloRingState = {
  opacity: number;
  scale: number;
  /** True when the halo should be painted (inside window or lingering fade). */
  active: boolean;
};

export const computeNodeHaloRing = (
  frame: number,
  props: NodeHaloRingProps,
): NodeHaloRingState => {
  const {
    at = 0,
    durationFrames = 36,
    peakOpacity = 0.8,
    peakScale = 1.25,
  } = props;
  const end = at + durationFrames;
  if (frame < at || frame > end) {
    return { opacity: 0, scale: 1, active: false };
  }
  const mid = at + durationFrames / 2;
  const opacity =
    frame <= mid
      ? interpolate(frame, [at, mid], [0, peakOpacity], {
          easing: EASE_OUT,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : interpolate(frame, [mid, end], [peakOpacity, 0], {
          easing: EASE_OUT,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const scale = interpolate(frame, [at, end], [1, peakScale], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity, scale, active: true };
};

export const NodeHaloRing: React.FC<NodeHaloRingProps> = (props) => {
  const frame = useCurrentFrame();
  const {
    x,
    y,
    w,
    h,
    radius = 12,
    color = ARCH_PALETTE.accentBlue,
    strokeWidth = 3,
  } = props;
  const { opacity, scale, active } = computeNodeHaloRing(frame, props);
  if (!active) return null;

  // Ring is an outline rect wrapping (and slightly inflated past) the node.
  const pad = 6;
  return (
    <svg
      width={w + pad * 2}
      height={h + pad * 2}
      viewBox={`0 0 ${w + pad * 2} ${h + pad * 2}`}
      style={{
        position: "absolute",
        left: x - pad,
        top: y - pad,
        pointerEvents: "none",
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      <rect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={w + pad * 2 - strokeWidth}
        height={h + pad * 2 - strokeWidth}
        rx={radius + pad}
        ry={radius + pad}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// BreathingHaloRing — continuous cosine-modulated ring. Use for the approval
// pause breath (amber) and its post-approval green aftermath.
// ---------------------------------------------------------------------------

export type BreathingHaloRingProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
  /** Frame at which the loop starts. Default 0. */
  at?: number;
  /** Loop period in frames. Default BREATHE_PERIOD_FRAMES (120 = 2s). */
  periodFrames?: number;
  /** Ring color. Default amber-bright. */
  color?: string;
  /** Min/max opacity cosine bounds. Default [0.3, 0.7]. */
  minOpacity?: number;
  maxOpacity?: number;
  /** Min/max scale cosine bounds. Default [1.0, 1.03]. */
  minScale?: number;
  maxScale?: number;
  strokeWidth?: number;
};

export type BreathingHaloRingState = {
  opacity: number;
  scale: number;
};

export const computeBreathingHaloRing = (
  frame: number,
  props: BreathingHaloRingProps,
): BreathingHaloRingState => {
  const {
    at = 0,
    periodFrames = BREATHE_PERIOD_FRAMES,
    minOpacity = 0.3,
    maxOpacity = 0.7,
    minScale = 1.0,
    maxScale = 1.03,
  } = props;
  if (frame < at) {
    return { opacity: minOpacity, scale: minScale };
  }
  const t = (frame - at) % periodFrames;
  const phase = (t / periodFrames) * Math.PI * 2;
  // cos(0)=1 (peak), cos(PI)=-1 (trough). Normalize to 0..1 with cos peak=max.
  const norm = (Math.cos(phase) + 1) / 2;
  return {
    opacity: minOpacity + (maxOpacity - minOpacity) * norm,
    scale: minScale + (maxScale - minScale) * norm,
  };
};

export const BreathingHaloRing: React.FC<BreathingHaloRingProps> = (props) => {
  const frame = useCurrentFrame();
  const {
    x,
    y,
    w,
    h,
    radius = 12,
    color = ARCH_PALETTE.amberBright,
    strokeWidth = 3,
  } = props;
  const { opacity, scale } = computeBreathingHaloRing(frame, props);

  const pad = 6;
  return (
    <svg
      width={w + pad * 2}
      height={h + pad * 2}
      viewBox={`0 0 ${w + pad * 2} ${h + pad * 2}`}
      style={{
        position: "absolute",
        left: x - pad,
        top: y - pad,
        pointerEvents: "none",
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      <rect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={w + pad * 2 - strokeWidth}
        height={h + pad * 2 - strokeWidth}
        rx={radius + pad}
        ry={radius + pad}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
};
