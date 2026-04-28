import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * 3-node RAW → APPROVAL → CLEANED diagram — the booklet's hero visual for
 * the Preprocess phase page (p12). The middle node is the LLM-delegated
 * approval gate, rendered with a Miami-Red dashed border and a small check
 * badge to echo the video's Panel3ApprovalGate composition (`video/remotion/
 * scenes/Slide/ProblemTrio/Panel3ApprovalGate.tsx`). Static; no Remotion
 * hooks — this runs in the booklet's print pipeline.
 *
 * Layout: 3 rounded-rect nodes of equal width, two hand-drawn arrows
 * between them. Sized to sit inside a ~5.5in full-width band.
 */

const NODE_H = 44;
const ARROW_W = 40;

export const ApprovalGateMicroWidget: React.FC<{
  gateColor?: string;
  style?: React.CSSProperties;
}> = ({ gateColor = COLORS.MIAMI_RED, style }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      gap: 0,
      ...style,
    }}
  >
    <Node label="RAW" sublabel="dataset" />
    <Arrow />
    <Node
      label="APPROVAL"
      sublabel="your call"
      dashed
      accent={gateColor}
      badge
    />
    <Arrow />
    <Node label="CLEANED" sublabel="ready for features" />
  </div>
);

const Node: React.FC<{
  label: string;
  sublabel: string;
  dashed?: boolean;
  accent?: string;
  badge?: boolean;
}> = ({ label, sublabel, dashed = false, accent = COLORS.INK, badge = false }) => (
  <div
    style={{
      position: "relative",
      flex: "0 1 auto",
      minWidth: 100,
      maxWidth: 140,
      height: NODE_H,
      borderRadius: 8,
      border: dashed
        ? `1.25pt dashed ${accent}`
        : `0.75pt solid ${COLORS.HAIRLINE_STRONG}`,
      background: dashed ? "transparent" : COLORS.PAPER_ELEVATED,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 12px",
      gap: 1,
    }}
  >
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        color: dashed ? accent : COLORS.INK,
        lineHeight: 1,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 9,
        color: COLORS.INK_MUTED,
        lineHeight: 1.1,
      }}
    >
      {sublabel}
    </div>
    {badge && (
      <div
        style={{
          position: "absolute",
          top: -10,
          right: -10,
          width: 20,
          height: 20,
          borderRadius: 10,
          background: COLORS.PAPER,
          border: `1.25pt solid ${accent}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={10} height={10} viewBox="0 0 14 14">
          <path
            d="M3 7 L6 10 L11 4"
            fill="none"
            stroke={accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )}
  </div>
);

const Arrow: React.FC = () => (
  <svg
    width={ARROW_W}
    height={24}
    viewBox={`0 0 ${ARROW_W} 24`}
    style={{ flexShrink: 0 }}
  >
    <path
      d={`M 2 12 C ${ARROW_W * 0.3} 6, ${ARROW_W * 0.7} 18, ${ARROW_W - 4} 12`}
      fill="none"
      stroke={COLORS.INK_MUTED}
      strokeWidth={1.25}
      strokeLinecap="round"
    />
    <path
      d={`M ${ARROW_W - 4} 12 L ${ARROW_W - 10} 7`}
      fill="none"
      stroke={COLORS.INK_MUTED}
      strokeWidth={1.25}
      strokeLinecap="round"
    />
    <path
      d={`M ${ARROW_W - 4} 12 L ${ARROW_W - 10} 16`}
      fill="none"
      stroke={COLORS.INK_MUTED}
      strokeWidth={1.25}
      strokeLinecap="round"
    />
  </svg>
);
