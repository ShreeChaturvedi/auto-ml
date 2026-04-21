import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN_OUT, EASE_OUT } from "../../config/easing";
import { ARCH_PALETTE } from "../../config/arch-layout";

export type AgentEdgeProps = {
  /** Line start in composition coords. */
  x1: number;
  y1: number;
  /** Line end in composition coords. */
  x2: number;
  y2: number;
  /** Frame the edge begins drawing. Default 0. */
  drawStartFrame?: number;
  /** Draw duration in frames. Default 48. */
  drawDurationFrames?: number;
  /** Stroke color. Default edge. */
  color?: string;
  /** Stroke width. Default 1.75. */
  strokeWidth?: number;
  /** Dasharray (e.g. "6 4" for pending-approval). Omit for solid. */
  strokeDasharray?: string;
  /**
   * Optional bead frame window. When set, renders a small circle traveling
   * from start → end via EASE_IN_OUT across the window.
   */
  beadStartFrame?: number;
  /** Bead travel duration. Default 28 (llm_delegated rate). */
  beadDurationFrames?: number;
  /** Bead fill. Default ACCENT_COLOR. */
  beadColor?: string;
  /** Bead radius. Default 5. */
  beadRadius?: number;
  /** Render an arrowhead at (x2, y2). Default true. */
  arrowhead?: boolean;
  /**
   * Optional arc height (pixels). When 0 (default), renders as a straight
   * line. When positive, renders as a quadratic bezier whose control point
   * `C = ((x1+x2)/2, min(y1,y2) - arcHeight)` — so the arc peak bulges
   * "up" (toward smaller y) by `arcHeight`. Used e.g. for loop-back edges
   * that need to clear a title above the node row.
   */
  arcHeight?: number;
  /** Style passthrough. */
  style?: React.CSSProperties;
};

export type AgentEdgeState = {
  dashoffset: number;
  length: number;
  /** Bead position or null when beadStartFrame is undefined / outside window. */
  bead: { cx: number; cy: number; opacity: number } | null;
  /** Arrow tip direction in degrees (atan2 from start → end). */
  arrowRotation: number;
};

const DEFAULT_DRAW_DURATION = 48;
const DEFAULT_BEAD_DURATION = 28;
const DEFAULT_BEAD_RADIUS = 5;
const BEAD_FADE_FRAMES = 6;

/**
 * Pure keyframe calculator for AgentEdge — draws the connecting line, a
 * traveling bead, and a static arrowhead. Exported for unit tests so the
 * edge math is deterministic without a render context.
 */
export const computeAgentEdge = (
  frame: number,
  props: AgentEdgeProps,
): AgentEdgeState => {
  const {
    x1,
    y1,
    x2,
    y2,
    drawStartFrame = 0,
    drawDurationFrames = DEFAULT_DRAW_DURATION,
    beadStartFrame,
    beadDurationFrames = DEFAULT_BEAD_DURATION,
    arcHeight = 0,
  } = props;

  const dx = x2 - x1;
  const dy = y2 - y1;
  // Control point for quadratic bezier arc (only meaningful when arcHeight>0).
  const cx_ctrl = (x1 + x2) / 2;
  const cy_ctrl = Math.min(y1, y2) - arcHeight;
  // Length approximation — chord plus a small arc-height contribution so the
  // dashoffset math still draws in cleanly for the curved case. Sub-pixel
  // error is fine for draw-in since we clamp the progress.
  const chord = Math.hypot(dx, dy);
  const length = arcHeight > 0 ? chord + arcHeight * 0.8 : chord;

  // Line draw-in (strokeDashoffset technique — same as MotionLine).
  const drawProgress = interpolate(
    frame,
    [drawStartFrame, drawStartFrame + drawDurationFrames],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const dashoffset = (1 - drawProgress) * length;

  // Arrowhead tip direction. For a straight line it's atan2(dy, dx). For a
  // bezier, the tangent at t=1 is 2·(P2 - C), so rotation = atan2(y2-cy, x2-cx).
  const arrowRotation =
    arcHeight > 0
      ? (Math.atan2(y2 - cy_ctrl, x2 - cx_ctrl) * 180) / Math.PI
      : (Math.atan2(dy, dx) * 180) / Math.PI;

  // Bead — only exists within [beadStartFrame, beadStartFrame + beadDurationFrames].
  let bead: AgentEdgeState["bead"] = null;
  if (beadStartFrame !== undefined) {
    const beadEnd = beadStartFrame + beadDurationFrames;
    if (frame >= beadStartFrame && frame <= beadEnd) {
      const t = interpolate(frame, [beadStartFrame, beadEnd], [0, 1], {
        easing: EASE_IN_OUT,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      // Bezier parametric bead: quadratic bezier (1-t)²P0 + 2(1-t)tC + t²P2.
      // Straight-line case falls out because C collapses to the midpoint.
      let cx: number;
      let cy: number;
      if (arcHeight > 0) {
        const omt = 1 - t;
        cx = omt * omt * x1 + 2 * omt * t * cx_ctrl + t * t * x2;
        cy = omt * omt * y1 + 2 * omt * t * cy_ctrl + t * t * y2;
      } else {
        cx = x1 + dx * t;
        cy = y1 + dy * t;
      }
      const fadeIn = interpolate(
        frame,
        [beadStartFrame, beadStartFrame + BEAD_FADE_FRAMES],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      const fadeOut = interpolate(
        frame,
        [beadEnd - BEAD_FADE_FRAMES, beadEnd],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      bead = { cx, cy, opacity: Math.min(fadeIn, fadeOut) };
    }
  }

  return { dashoffset, length, bead, arrowRotation };
};

/**
 * SVG-rendered graph edge: a line (with optional dashed pattern) plus a
 * static arrowhead at the end. Optionally hosts a traveling bead that rides
 * the edge from start → end across a declared window.
 *
 * Because every node in this section lives in composition coordinates
 * (1920×1080), AgentEdge renders an absolute-positioned `<svg>` sized to the
 * bounding box so it layers cleanly above/below <GraphNode> siblings.
 */
export const AgentEdge: React.FC<AgentEdgeProps> = (props) => {
  const frame = useCurrentFrame();
  const {
    x1,
    y1,
    x2,
    y2,
    color = ARCH_PALETTE.edge,
    strokeWidth = 1.75,
    strokeDasharray,
    beadColor = ARCH_PALETTE.accentBlue,
    beadRadius = DEFAULT_BEAD_RADIUS,
    arrowhead = true,
    arcHeight = 0,
    style,
  } = props;

  const { dashoffset, length, bead, arrowRotation } = computeAgentEdge(
    frame,
    props,
  );

  // Bounding box: extend past the tip by a bit so the arrowhead isn't clipped.
  // When arcHeight>0, include the control-point peak so the curve isn't
  // clipped above the node row.
  const ARROW_SIZE = 12;
  const svgPadding = ARROW_SIZE + strokeWidth;
  const cx_ctrl = (x1 + x2) / 2;
  const cy_ctrl = Math.min(y1, y2) - arcHeight;
  const minX = Math.min(x1, x2) - svgPadding;
  const minY =
    arcHeight > 0
      ? Math.min(y1, y2, cy_ctrl) - svgPadding
      : Math.min(y1, y2) - svgPadding;
  const maxX = Math.max(x1, x2) + svgPadding;
  const maxY = Math.max(y1, y2) + svgPadding;
  const w = maxX - minX;
  const h = maxY - minY;

  // Path string for quadratic bezier — swapped in when arcHeight > 0.
  const arcPathD = `M ${x1} ${y1} Q ${cx_ctrl} ${cy_ctrl} ${x2} ${y2}`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`${minX} ${minY} ${w} ${h}`}
      style={{
        position: "absolute",
        left: minX,
        top: minY,
        overflow: "visible",
        pointerEvents: "none",
        ...style,
      }}
    >
      {arcHeight > 0 ? (
        <path
          d={arcPathD}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={strokeDasharray ?? length}
          strokeDashoffset={strokeDasharray ? 0 : dashoffset}
        />
      ) : (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray ?? length}
          strokeDashoffset={strokeDasharray ? 0 : dashoffset}
        />
      )}
      {arrowhead ? (
        <polygon
          points={`0,0 -${ARROW_SIZE},-${ARROW_SIZE / 2} -${ARROW_SIZE},${ARROW_SIZE / 2}`}
          fill={color}
          transform={`translate(${x2}, ${y2}) rotate(${arrowRotation})`}
          opacity={dashoffset === 0 ? 1 : 0}
        />
      ) : null}
      {bead !== null ? (
        <circle
          cx={bead.cx}
          cy={bead.cy}
          r={beadRadius}
          fill={beadColor}
          opacity={bead.opacity}
        />
      ) : null}
    </svg>
  );
};
