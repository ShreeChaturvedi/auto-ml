import React from "react";
import { COLORS, FONTS } from "../theme";
import { INSTITUTION } from "../content";
import { CoverTerrain } from "../visuals/CoverTerrain";

/**
 * Back cover (page 28). Continues the wraparound topographic field from
 * the front cover: same seed, noise field shifted one page-width on x so
 * the terrain reads as mathematically continuous across the fold. Front
 * shows the apex half; back shows the valley half (no Miami Red line).
 * Institutional colophon upper-left, closing italic bottom-right. No page
 * number on covers.
 */
export const BackCoverPage: React.FC = () => (
  <section
    className="page"
    data-bleed="true"
    style={{
      background: COLORS.PAPER_WARM,
      position: "relative",
      overflow: "hidden",
    }}
  >
    <CoverTerrain widthIn={8.75} heightIn={11.25} variant="back" />

    {/* Institutional colophon — upper-left */}
    <div
      style={{
        position: "absolute",
        top: "0.65in",
        left: "0.65in",
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
        maxWidth: "3in",
        lineHeight: 1.4,
      }}
    >
      {INSTITUTION.university}
      <br />
      {INSTITUTION.course} · {INSTITUTION.track}
      <br />
      {INSTITUTION.year}
    </div>

    {/* Small italic line at bottom-right — booklet's last word */}
    <div
      style={{
        position: "absolute",
        bottom: "0.65in",
        right: "0.65in",
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 13,
        color: COLORS.INK_MUTED,
        textAlign: "right",
      }}
    >
      — End of booklet.
    </div>
  </section>
);

