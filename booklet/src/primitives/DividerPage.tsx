import React from "react";
import { COLORS, FONTS, TYPE, PAGE } from "../theme";

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

    {/* Subtitle — Plus Jakarta 24pt, two lines max. */}
    <div
      style={{
        position: "absolute",
        top: `calc(${PAGE.margin.top}in + ${TYPE.display.size * TYPE.display.lh}pt + ${TYPE.sectionTitle.size}pt)`,
        left: `${PAGE.margin.outer}in`,
        right: `${PAGE.margin.outer}in`,
        fontFamily: FONTS.SANS,
        fontSize: TYPE.dividerSubtitle.size,
        fontWeight: TYPE.dividerSubtitle.weight,
        letterSpacing: TYPE.dividerSubtitle.tracking,
        lineHeight: TYPE.dividerSubtitle.lh,
        color: COLORS.PAPER,
        maxWidth: "5.5in",
      }}
    >
      {subtitle}
    </div>

    {/* 3D SVG slot — lower-right, ~3"×4". The Gemini asset lands at `artSlot`. */}
    <div
      style={{
        position: "absolute",
        right: `${PAGE.margin.outer}in`,
        bottom: `${PAGE.margin.bottom + 0.5}in`,
        width: "3in",
        height: "4in",
      }}
    >
      <ArtSlot src={artSlot} />
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

/** Renders the Gemini SVG if present, or a labeled dashed placeholder. */
const ArtSlot: React.FC<{ src: string }> = ({ src }) => {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
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
