import React from "react";
import { COLORS, FONTS, TYPE } from "../tokens";
import { INSTITUTION } from "../content";
import { AnimatedLogoMark } from "../visuals/AnimatedLogoMark";
import { FlourishUnderline } from "../visuals/FlourishUnderline";
import { MiamiDivider } from "../visuals/MiamiDivider";

/**
 * Thin 3-inch top band. Three baseline-aligned clusters across the page:
 *
 *   [ LogoWordmark · full product name as a stroked SVG ]
 *   [          CSE 449 · SENIOR DESIGN PROJECT · 2026           ]
 *   [                       italic tagline, right-hung           ]
 *
 * The entire wordmark — including the letters after the A — is a single
 * SVG so the name reads as one drafted piece alongside the mark. The
 * institutional caption has moved up from the footer to the header's
 * horizontal center, matching the CTA typography ("Try it on your dataset").
 */

export const Header: React.FC = () => (
  <header
    style={{
      width: "100%",
      height: "3in",
      padding: "0 1in",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      position: "relative",
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        columnGap: 32,
        paddingBottom: "0.35in",
      }}
    >
      {/* Left: A mark followed by "gentic AutoML Platform". Flex bottoms
       *  align so the A's leg-ends meet the 'g' descender curve. */}
      <div
        style={{
          justifySelf: "start",
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
          fontFamily: FONTS.SANS,
          fontWeight: 700,
          fontSize: 112,
          letterSpacing: "-0.025em",
          lineHeight: 1,
          color: COLORS.INK,
          whiteSpace: "nowrap",
        }}
      >
        {/* Negative margin absorbs the A's viewBox descender padding so
         *  the A's leg-ends (y≈26.5 in a 32-unit viewBox) line up with
         *  the 'g' descender curve instead of the SVG's physical bottom. */}
        <div style={{ marginBottom: -24 }}>
          <AnimatedLogoMark size={140} color={COLORS.INK} />
        </div>
        <span>gentic AutoML Platform</span>
      </div>

      {/* Center: institutional caption, CTA typography */}
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: COLORS.INK,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {INSTITUTION.caption}
      </div>

      {/* Right: serif tagline with Miami-red flourish */}
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontSize: 72,
          fontWeight: 400,
          color: COLORS.INK_MUTED,
          lineHeight: 1,
          letterSpacing: TYPE.heroTagline.tracking,
          textAlign: "right",
          whiteSpace: "nowrap",
          justifySelf: "end",
        }}
      >
        we automate the{" "}
        <span
          style={{
            position: "relative",
            display: "inline-block",
            color: COLORS.INK,
            fontWeight: 700,
          }}
        >
          entire ML pipeline
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "-0.08em",
              height: 18,
              pointerEvents: "none",
            }}
          >
            <FlourishUnderline
              width="100%"
              height={18}
              strokeWidth={3}
              color={COLORS.MIAMI_RED}
            />
          </span>
        </span>
        .
      </div>
    </div>

    {/* Miami gradient divider */}
    <MiamiDivider heightPx={2} />
  </header>
);
