import React from "react";
import { COLORS, FONTS, PAGE, TYPE } from "../theme";
import { AnimatedLogoMark } from "../visuals/AnimatedLogoMark";
import { CoverTerrain } from "../visuals/CoverTerrain";

/**
 * Front cover (page 01). Full-bleed cream ground with an algorithmic
 * topographic terrain as the hero art, the 'A' mark riding the apex in
 * Miami Red, the title block in the lower-right, and the vertical
 * Monaspace margin callout on the left. The terrain is deterministic
 * from a seed — back-cover pair uses the same seed with `variant="back"`.
 */
export const CoverPage: React.FC = () => (
  <section
    className="page"
    data-bleed="true"
    style={{
      background: COLORS.PAPER_WARM,
      position: "relative",
      overflow: "hidden",
    }}
  >
    {/* Algorithmic topographic terrain — apex biased to the 'A' mark. */}
    <CoverTerrain widthIn={8.75} heightIn={11.25} variant="front" />

    {/* The canonical 'A' mark rides on top at the peak, in Miami Red.
        Peak gaussian is centered at (0.5, 0.213) in the engine so the
        'A' (top 2.4in / 11.25in = 0.213) sits inside the apex contour. */}
    <div
      style={{
        position: "absolute",
        top: "2.4in",
        left: "50%",
        transform: "translateX(-50%)",
      }}
    >
      <AnimatedLogoMark size={96} color={COLORS.MIAMI_RED} />
    </div>

    {/* Vertical Monaspace margin callout — left edge */}
    <div
      style={{
        position: "absolute",
        left: "0.5in",
        top: `${PAGE.margin.top}in`,
        writingMode: "vertical-rl",
        transform: "rotate(180deg)",
        fontFamily: FONTS.MONO,
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
      }}
    >
      miami cse · expo 2026
    </div>

    {/* Soft cream scrim behind the title block — boosts title legibility
        over the contour topo without reading as a visible panel. A radial
        gradient feathered into PAPER_WARM keeps the cover's print feel. */}
    <div
      style={{
        position: "absolute",
        right: "0.25in",
        bottom: "0.55in",
        width: "4.3in",
        height: "2.4in",
        background: `radial-gradient(ellipse at 75% 65%, ${COLORS.PAPER_WARM} 0%, ${COLORS.PAPER_WARM} 52%, rgba(245,243,240,0) 100%)`,
        pointerEvents: "none",
      }}
    />

    {/* Title block — bottom-right */}
    <div
      style={{
        position: "absolute",
        right: "0.65in",
        bottom: "0.85in",
        textAlign: "right",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          lineHeight: 0.95,
          color: COLORS.INK,
        }}
      >
        AGENTIC
        <br />
        AUTOML
      </div>
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: TYPE.subheadMedium.size,
          fontWeight: TYPE.subheadMedium.weight,
          lineHeight: TYPE.subheadMedium.lh,
          color: COLORS.INK_MUTED,
          letterSpacing: "0",
          maxWidth: "3.5in",
          marginLeft: "auto",
        }}
      >
        we automate the 80% that isn’t training.
      </div>
      <div
        style={{
          marginTop: 12,
          fontFamily: FONTS.MONO,
          fontSize: 8.5,
          fontWeight: 500,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: COLORS.INK,
        }}
      >
        Shree Chaturvedi · Ayush Yadav · 2026
      </div>
    </div>
  </section>
);

