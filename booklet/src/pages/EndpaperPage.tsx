import React from "react";
import { Page } from "../primitives/Page";
import { COLORS, FONTS, TYPE, PAGE } from "../theme";
import { ABSTRACT, BRAND } from "../content";

/**
 * Inside front cover (page 02). Endpaper with a faint FSM watermark at 20%
 * Miami Red, "Welcome." in serif italic upper-left, and the ≤80-word
 * abstract in Plus Jakarta 11pt bottom-left.
 */
export const EndpaperPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <Page
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="FRONTMATTER"
    sectionColor={COLORS.INK_MUTED}
    hideFooter
  >
    {/* Faint watermark — simple radial glyphs representing the FSM; swapped
        for a pure-data SVG so there's no dependency on PreprocessingFSM at
        this stage of the book. */}
    <Watermark />

    <div
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 20,
        lineHeight: 1.2,
        color: COLORS.INK,
      }}
    >
      {ABSTRACT.greeting}
    </div>

    <div
      style={{
        position: "absolute",
        left: `${PAGE.margin.outer}in`,
        right: `${PAGE.margin.outer + 1.5}in`,
        bottom: "1.2in",
        fontFamily: FONTS.SANS,
        fontSize: TYPE.body.size,
        fontWeight: TYPE.body.weight,
        letterSpacing: TYPE.body.tracking,
        lineHeight: TYPE.body.lh,
        color: COLORS.INK,
      }}
    >
      {ABSTRACT.body}
    </div>

    {/* URL footnote at the bottom */}
    <div
      style={{
        position: "absolute",
        left: `${PAGE.margin.outer}in`,
        bottom: "0.65in",
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 500,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: COLORS.INK_SUBTLE,
      }}
    >
      {BRAND.liveUrl}
    </div>
  </Page>
);

const Watermark: React.FC = () => (
  <svg
    width="7in"
    height="7in"
    viewBox="0 0 600 600"
    style={{
      position: "absolute",
      right: "-1in",
      bottom: "-1in",
      opacity: 0.2,
      pointerEvents: "none",
    }}
  >
    {/* 8 node boxes arranged in 2 rows, representing the preprocessing FSM */}
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const x = 40 + (i % 3) * 180;
      const y = 120 + Math.floor(i / 3) * 180;
      return (
        <g key={i}>
          <rect
            x={x}
            y={y}
            width={140}
            height={64}
            rx={8}
            fill="none"
            stroke={COLORS.MIAMI_RED}
            strokeWidth={1.5}
          />
        </g>
      );
    })}
    {/* Connecting lines */}
    <g fill="none" stroke={COLORS.MIAMI_RED} strokeWidth={1.5}>
      <line x1={180} y1={152} x2={220} y2={152} />
      <line x1={360} y1={152} x2={400} y2={152} />
      <line x1={540} y1={184} x2={540} y2={300} />
      <line x1={180} y1={332} x2={220} y2={332} />
      <line x1={360} y1={332} x2={400} y2={332} />
      <line x1={110} y1={184} x2={110} y2={300} />
    </g>
  </svg>
);
