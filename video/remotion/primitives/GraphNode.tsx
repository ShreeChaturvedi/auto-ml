import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { MONOSPACE_FONT, TITLE_FONT } from "../../config/fonts";
import { ARCH_PALETTE } from "../../config/arch-layout";
import { SPRING_UI } from "../../config/easing";

export type GraphNodeTier = "deterministic" | "llm_delegated" | "text" | "action";

export type GraphNodeStatus =
  | "idle"
  | "active"
  | "retry"
  | "success"
  | "approval";

export type GraphNodeProps = {
  /**
   * Node label rendered inside the pill. Required when `children` are not
   * supplied; ignored when `children` override the default label block.
   */
  label?: string;
  /** Optional monospace subtitle below the label. */
  subtitle?: string;
  /** Visual tier — controls fill/border/ring. Default `deterministic`. */
  tier?: GraphNodeTier;
  /** Visual status — controls border accent. Default `idle`. */
  status?: GraphNodeStatus;
  /** Top-left origin. */
  x: number;
  y: number;
  /** Box size — default 220×72. */
  w?: number;
  h?: number;
  /** Corner radius. Default 12. */
  radius?: number;
  /** Frame at which the spring-enter begins. Default 0. */
  enterFrame?: number;
  /** Spring duration in frames. Default 24. */
  enterDurationFrames?: number;
  /** Pre-rendered children (e.g., inline icon) — overrides default label block. */
  children?: React.ReactNode;
  /**
   * Override the tier's default background fill. Use when consuming the
   * primitive outside the architecture section so the ARCH_PALETTE defaults
   * (paper / paperAlt / ink) don't silently leak into other themes.
   */
  background?: string;
  /**
   * Override the tier/status border color. Useful for theme-aware non-arch
   * consumers — only the color swaps; width / dash pattern follow the tier.
   */
  borderColor?: string;
  /** Override the default text/label color. */
  textColor?: string;
  /** Override or disable the tier's default inner ring (llm_delegated tier
   *  injects an inset shadow for the LLM ring; non-arch consumers may want
   *  to disable it to keep the runway palette intact). Pass `false` or `null`
   *  to disable; pass a CSS box-shadow string to override. */
  innerRing?: string | false | null;
};

export type GraphNodeKeyframes = {
  opacity: number;
  scale: number;
  /** Composed border shorthand, e.g. `"1.5px solid #171717"`. */
  border: string;
  /** SVG stroke-dasharray value when the border is dashed, else null. */
  dashPattern: string | null;
  /** Stroke width (numeric px) — mirrors the value in `border`. */
  borderWidth: number;
  /** Stroke color — mirrors the value in `border`. */
  borderColor: string;
  background: string;
  textColor: string;
  innerRing: string | null;
};

const DEFAULT_W = 220;
const DEFAULT_H = 72;
const DEFAULT_RADIUS = 12;
const DEFAULT_ENTER_DURATION = 24;
const ENTER_SCALE_FROM = 0.96;

/**
 * Pure keyframe calculator — testable without Remotion's render context.
 * Returns the visual state of the node at a given frame under the given props
 * (plus spring progress computed from fps by the caller or passed directly).
 */
export const computeGraphNode = (
  frame: number,
  progress: number,
  props: GraphNodeProps,
): GraphNodeKeyframes => {
  const tier = props.tier ?? "deterministic";
  const status = props.status ?? "idle";

  const opacity = interpolate(progress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(progress, [0, 1], [ENTER_SCALE_FROM, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ---- Base tier styling ----
  let background: string = ARCH_PALETTE.paperAlt;
  let textColor: string = ARCH_PALETTE.ink;
  let innerRing: string | null = null;
  let borderWidth = 1.5;
  let borderColor: string = ARCH_PALETTE.ink;
  let borderStyle: "solid" | "dashed" = "solid";
  let dashPattern: string | null = null;

  if (tier === "llm_delegated") {
    borderStyle = "dashed";
    dashPattern = "4 2";
    innerRing = `inset 0 0 0 8px ${ARCH_PALETTE.llmNodeRing}`;
  } else if (tier === "text") {
    background = ARCH_PALETTE.paper;
    borderWidth = 1;
  } else if (tier === "action") {
    background = ARCH_PALETTE.ink;
    textColor = "#FFFFFF";
    borderWidth = 0;
    borderColor = "transparent";
  }

  // ---- Status overlay (overrides border accent) ----
  if (status === "active") {
    borderColor = ARCH_PALETTE.accentBlue;
    borderWidth = 2;
    borderStyle = "solid";
    dashPattern = null;
  } else if (status === "retry") {
    borderColor = ARCH_PALETTE.amber;
    borderWidth = 2;
    borderStyle = "solid";
    dashPattern = null;
  } else if (status === "success") {
    borderColor = ARCH_PALETTE.successGreen;
    borderWidth = 2;
    borderStyle = "solid";
    dashPattern = null;
  } else if (status === "approval") {
    borderStyle = "dashed";
    dashPattern = "6 4";
    borderWidth = 1.5;
  }

  // ---- Optional caller overrides ----
  // Applied last so they win against tier + status defaults. Width / dash
  // pattern stay tier-driven so non-arch consumers can re-skin a node without
  // losing the visual tier semantics.
  if (props.background !== undefined) background = props.background;
  if (props.borderColor !== undefined) borderColor = props.borderColor;
  if (props.textColor !== undefined) textColor = props.textColor;
  if (props.innerRing !== undefined) {
    innerRing = props.innerRing === false || props.innerRing === null
      ? null
      : props.innerRing;
  }

  const border = `${borderWidth}px ${borderStyle} ${borderColor}`;
  return {
    opacity,
    scale,
    border,
    dashPattern,
    borderWidth,
    borderColor,
    background,
    textColor,
    innerRing,
  };
};

export const GraphNode: React.FC<GraphNodeProps> = (props) => {
  const {
    label,
    subtitle,
    tier = "deterministic",
    x,
    y,
    w = DEFAULT_W,
    h = DEFAULT_H,
    radius = DEFAULT_RADIUS,
    enterFrame = 0,
    enterDurationFrames = DEFAULT_ENTER_DURATION,
    children,
  } = props;

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    fps,
    frame: frame - enterFrame,
    config: SPRING_UI,
    durationInFrames: enterDurationFrames,
  });

  const {
    opacity,
    scale,
    border,
    dashPattern,
    borderWidth,
    borderColor,
    background,
    textColor,
    innerRing,
  } = computeGraphNode(frame, progress, props);

  // Use an SVG rect overlay for dashed border patterns so we can control the
  // dash array precisely (CSS borders can't set arbitrary dash lengths).
  const isDashed = dashPattern !== null;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        borderRadius: radius,
        background,
        border: isDashed ? "none" : border,
        boxShadow: innerRing ?? undefined,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: textColor,
      }}
    >
      {/* Dashed-border overlay — rendered as SVG so the dash array is
       *  deterministic and pixel-accurate. */}
      {isDashed ? (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: radius,
          }}
        >
          <rect
            x={1}
            y={1}
            width={w - 2}
            height={h - 2}
            rx={radius - 1}
            ry={radius - 1}
            fill="none"
            stroke={borderColor}
            strokeWidth={borderWidth}
            strokeDasharray={dashPattern ?? undefined}
          />
        </svg>
      ) : null}

      {children ?? (
        <>
          {(() => {
            const isUpper = tier !== "text";
            const isMono = tier === "deterministic" || tier === "action" || tier === "llm_delegated";
            return (
              <div
                style={{
                  fontSize: isUpper ? 16 : 20,
                  fontWeight: 600,
                  letterSpacing: isUpper ? "0.02em" : "-0.005em",
                  textTransform: isUpper ? "uppercase" : "none",
                  lineHeight: 1,
                  fontFamily: isMono ? MONOSPACE_FONT.fontFamily : TITLE_FONT.fontFamily,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "clip",
                  maxWidth: "calc(100% - 24px)",
                  textAlign: "center",
                }}
              >
                {label}
              </div>
            );
          })()}
          {subtitle ? (
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 14,
                fontWeight: 500,
                marginTop: 4,
                opacity: 0.8,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
