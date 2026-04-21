import React from "react";
import { COLORS, FONTS, TYPE, PAGE, type SectionKey } from "../theme";
import { DIORAMAS } from "../visuals/diorama";

/**
 * Full-bleed divider-page chrome. A solid-color field with the chapter
 * number (white Plus Jakarta 220pt), the chapter title (white Instrument
 * Serif italic 80pt), and a white subtitle. Reserved region in the lower
 * right holds the Gemini 3D SVG diorama — when absent, renders a dashed
 * placeholder sized to the spec so layout stays honest.
 */

export type DividerPageProps = {
  chapterNum: string;
  chapterTitle: string;
  subtitle: string;
  color: string;
  /** `/art/<slot>.svg` — shown when the file exists; dashed placeholder otherwise. */
  artSlot: string;
  /** Section key — selects the programmatic diorama fallback. */
  sectionKey: SectionKey;
  /** Chapter n / total — the `04 / 05` bottom band. */
  chapterIndex: number;
  chapterTotal: number;
};

export const DividerPage: React.FC<DividerPageProps> = ({
  chapterNum,
  chapterTitle,
  subtitle,
  color,
  artSlot,
  sectionKey,
  chapterIndex,
  chapterTotal,
}) => (
  <section
    className="page"
    data-bleed="true"
    style={{
      background: color,
      color: COLORS.PAPER,
      position: "relative",
      overflow: "hidden",
    }}
  >
    {/* Chapter number — massive, top-left, tight to the page edge. */}
    <div
      style={{
        position: "absolute",
        top: `${PAGE.margin.top}in`,
        left: `${PAGE.margin.outer}in`,
        fontFamily: FONTS.SANS,
        fontSize: TYPE.display.size,
        fontWeight: TYPE.display.weight,
        letterSpacing: TYPE.display.tracking,
        lineHeight: TYPE.display.lh,
        color: COLORS.PAPER,
      }}
    >
      {chapterNum}
    </div>

    {/* Chapter title — serif italic, sits below the number at a deliberate offset. */}
    <div
      style={{
        position: "absolute",
        top: `calc(${PAGE.margin.top}in + ${TYPE.display.size * TYPE.display.lh}pt - 20pt)`,
        left: `${PAGE.margin.outer}in`,
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: TYPE.sectionTitle.size,
        fontWeight: TYPE.sectionTitle.weight,
        letterSpacing: TYPE.sectionTitle.tracking,
        lineHeight: TYPE.sectionTitle.lh,
        color: COLORS.PAPER,
      }}
    >
      {chapterTitle}
    </div>

    {/* Subtitle — Instrument Serif (upright) 24pt, two lines max. Serif
        pairs the subtitle with the chapter title's cadence while staying
        visually distinct via weight/italic treatment. */}
    <div
      style={{
        position: "absolute",
        top: `calc(${PAGE.margin.top}in + ${TYPE.display.size * TYPE.display.lh}pt + ${TYPE.sectionTitle.size}pt)`,
        left: `${PAGE.margin.outer}in`,
        right: `${PAGE.margin.outer}in`,
        fontFamily: FONTS.SERIF,
        fontStyle: "normal",
        // Serif has a lower x-height than the prior sans at the same px
        // size — a modest bump (24→26) restores optical weight without
        // breaking the subtitle's visual weight relative to the title.
        fontSize: TYPE.dividerSubtitle.size + 2,
        fontWeight: 400,
        letterSpacing: TYPE.dividerSubtitle.tracking,
        lineHeight: TYPE.dividerSubtitle.lh,
        color: COLORS.PAPER,
        maxWidth: "5.5in",
      }}
    >
      {subtitle}
    </div>

    {/* 3D SVG slot — 3:4 aspect matches the diorama viewBox so there's no
        empty padding around the scene. Enlarged from 3×4" to 3.375×4.5".
        Bottom anchored so the corner label band lands well below the
        subtitle baseline; the diorama reads as an architectural hero on
        the lower-right without overlapping the typography above it. */}
    <div
      style={{
        position: "absolute",
        right: `${PAGE.margin.outer}in`,
        bottom: `${PAGE.margin.bottom + 0.05}in`,
        width: "3.375in",
        height: "4.5in",
      }}
    >
      <ArtSlot src={artSlot} sectionKey={sectionKey} />
    </div>

    {/* Chapter counter — Monaspace "04 / 05" bottom band, white opacity 0.75. */}
    <div
      style={{
        position: "absolute",
        left: `${PAGE.margin.outer}in`,
        bottom: "0.5in",
        fontFamily: FONTS.MONO,
        fontSize: TYPE.eyebrowLarge.size,
        fontWeight: TYPE.eyebrowLarge.weight,
        letterSpacing: TYPE.eyebrowLarge.tracking,
        textTransform: "uppercase",
        color: "rgba(255, 255, 255, 0.8)",
      }}
    >
      {String(chapterIndex).padStart(2, "0")} / {String(chapterTotal).padStart(2, "0")}
    </div>
  </section>
);

/**
 * Renders the commissioned SVG if it exists, else the programmatic diorama
 * keyed by sectionKey, else a dashed placeholder. Pipeline allows a future
 * hand-authored asset at `/art/div-0X-*.svg` to override the programmatic
 * fallback without code changes.
 */
const ArtSlot: React.FC<{ src: string; sectionKey: SectionKey }> = ({ src, sectionKey }) => {
  const [failed, setFailed] = React.useState(false);
  const Diorama = DIORAMAS[sectionKey];
  if (failed) {
    if (Diorama) {
      return (
        <div style={{ width: "100%", height: "100%" }}>
          <Diorama />
        </div>
      );
    }
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          border: `1pt dashed rgba(255, 255, 255, 0.55)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONTS.MONO,
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255, 255, 255, 0.75)",
          textAlign: "center",
          padding: 12,
        }}
      >
        3D diorama slot · {src.split("/").pop()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
      }}
    />
  );
};
