import React from "react";
import { COLORS, FONTS, TYPE } from "../theme";

/**
 * "PENDING APPROVAL" callout — dotted 0.75pt INK border, Monaspace eyebrow,
 * Instrument Serif italic body. Conceptually mirrors the product's approval
 * gate.
 *
 * The plan budgets ≤4 instances across the whole booklet; use only where
 * the gate metaphor earns its page real estate.
 */
export const ApprovalGateCallout: React.FC<{
  children: React.ReactNode;
  width?: number | string;
  style?: React.CSSProperties;
}> = ({ children, width = "100%", style }) => (
  <div
    style={{
      border: `0.75pt dotted ${COLORS.INK}`,
      padding: "14px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      width,
      boxSizing: "border-box",
      ...style,
    }}
  >
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: TYPE.approvalLabel.size,
        fontWeight: TYPE.approvalLabel.weight,
        letterSpacing: TYPE.approvalLabel.tracking,
        textTransform: "uppercase",
        color: COLORS.INK,
        lineHeight: 1,
      }}
    >
      PENDING APPROVAL
    </div>
    <div
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 16,
        fontWeight: 400,
        letterSpacing: "0",
        lineHeight: 1.3,
        color: COLORS.INK,
      }}
    >
      {children}
    </div>
  </div>
);
