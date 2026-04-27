import React from "react";
import { COLORS, FONTS } from "../tokens";
import { AnimatedLogoMark } from "./AnimatedLogoMark";
import { MiamiMark } from "./MiamiMark";

/**
 * Space-efficient combined lockup from `video/remotion/primitives/SlideFooter.tsx:94-124`:
 *
 *   [A-mark] AutoML  │  [Miami-M] Miami University
 *
 * Plus Jakarta 600, 0.02em tracking, INK. Exact typography spec lifted from
 * the video footer so the poster reads as the same brand system.
 */

export type CombinedLockupProps = {
  /** Mark height in pt. Text sizes track accordingly. */
  markSize: number;
  /** Type size in pt. Default ≈ 0.55× markSize. */
  textSize?: number;
  /** Horizontal margin on each side of the pipe separator, in pt. */
  pipeMargin?: number;
};

export const CombinedLockup: React.FC<CombinedLockupProps> = ({
  markSize,
  textSize,
  pipeMargin = 28,
}) => {
  const ts = textSize ?? Math.round(markSize * 0.56);
  const textStyle: React.CSSProperties = {
    fontFamily: FONTS.SANS,
    fontWeight: 600,
    fontSize: ts,
    letterSpacing: "0.02em",
    color: COLORS.INK,
    lineHeight: 1.2,
    marginLeft: Math.round(markSize * 0.32),
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      <AnimatedLogoMark size={markSize} color={COLORS.INK} />
      <div style={textStyle}>AutoML</div>
      <div
        style={{
          width: 1.5,
          height: markSize * 0.7,
          background: COLORS.INK,
          marginLeft: pipeMargin,
          marginRight: pipeMargin,
          flexShrink: 0,
        }}
      />
      <MiamiMark size={markSize} />
      <div style={textStyle}>Miami University</div>
    </div>
  );
};
