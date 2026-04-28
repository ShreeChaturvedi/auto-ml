import React from "react";
import { Page } from "../primitives/Page";
import { COLORS, FONTS, TYPE, PAGE } from "../theme";
import { ABSTRACT, BRAND } from "../content";
import { CoverTerrain } from "../visuals/CoverTerrain";

/**
 * Inside front cover (page 02). A full-trim topographic endpaper — the same
 * algorithmic terrain engine that renders the cover, seeded with a distinct
 * window of the noise field and pulled-off-page peak so the contours read as
 * a calm diagonal sweep rather than a focal summit. Running the engine here
 * creates cohesion with p1 (continuous visual grammar), replaces the tiny,
 * bottom-right FSM watermark that read as afterthought, and intentionally
 * fills ≥90% of the page area so the eye registers it as structural, not
 * decorative.
 *
 * Layering (bottom → top):
 *   1. Full-trim terrain SVG (lineOnly, strokeAlpha=0.22) absolutely
 *      positioned to the page edges. 22% stroke alpha × ACCENT→TEAL_EXT
 *      gradient = a cool desaturated wash that never competes with text.
 *   2. A soft linear white scrim over the lower-left corner so the 11pt
 *      abstract body reads crisp against the underlying contour rings.
 *   3. The "Welcome." greeting (serif italic) and ABSTRACT.body copy on top.
 *   4. URL footnote anchored to the outer-left baseline.
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
    {/* Full-trim algorithmic topography — same CoverTerrain engine as p1,
        different noise window + off-page peak so the pages feel related but
        not repetitive. lineOnly mode suppresses paper-ground + grain so this
        composites cleanly on the page's white background. Negative margin
        inset pulls it past the Page's padding out to the trim edges. */}
    <div
      style={{
        position: "absolute",
        top: `-${PAGE.margin.top}in`,
        bottom: `-${PAGE.margin.bottom}in`,
        left: `-${parity === "recto" ? PAGE.margin.inner : PAGE.margin.outer}in`,
        right: `-${parity === "recto" ? PAGE.margin.outer : PAGE.margin.inner}in`,
        pointerEvents: "none",
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      <CoverTerrain
        widthIn={PAGE.trimW}
        heightIn={PAGE.trimH}
        variant="endpaper"
        seed="miami-cse-2026-endpaper"
        lineOnly
        strokeAlpha={0.32}
      />
    </div>

    {/* Legibility scrim — a low-opacity white gradient under the abstract
        body only. Upper-right stays open so the contours carry the visual
        weight; lower-left gets a gentle ~60% white veil where the 11pt copy
        sits. */}
    <div
      style={{
        position: "absolute",
        top: "55%",
        bottom: `-${PAGE.margin.bottom}in`,
        left: `-${parity === "recto" ? PAGE.margin.inner : PAGE.margin.outer}in`,
        right: "35%",
        pointerEvents: "none",
        background:
          "linear-gradient(to top right, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.55) 55%, rgba(255,255,255,0) 100%)",
      }}
      aria-hidden="true"
    />

    {/* "Welcome." — serif italic, upper-left. Stays crisp above the terrain. */}
    <div
      style={{
        position: "relative",
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 84,
        lineHeight: 0.95,
        letterSpacing: "-0.02em",
        color: COLORS.INK,
      }}
    >
      {ABSTRACT.greeting}
    </div>

    {/* A faint Miami Red baseline under "Welcome." — ties the endpaper to
        the book's primary accent without repeating the cover's apex ring. */}
    <div
      style={{
        position: "relative",
        width: "1.6in",
        height: 2,
        marginTop: "0.45in",
        background: COLORS.MIAMI_RED,
        opacity: 0.9,
      }}
      aria-hidden="true"
    />

    {/* Abstract body — anchored bottom-left, sitting on the legibility scrim. */}
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

    {/* URL footnote — anchored to the outer-left baseline. */}
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
