import React from "react";
import { Page } from "../primitives/Page";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { BRAND, INSTITUTION, STUDENTS, CHAPTERS } from "../content";

/**
 * Title page + table of contents (page 03). Left column: full title, version,
 * authors, date. Right column: color-coded TOC with a swatch per chapter.
 * Bottom-right: short colophon.
 */
export const TocPage: React.FC<{
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: "0.5in",
        height: "100%",
      }}
    >
      {/* Left column — full title / authors / colophon */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: TYPE.eyebrow.size,
            fontWeight: 600,
            letterSpacing: TYPE.eyebrow.tracking,
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
          }}
        >
          Vol. 01 · System Card
        </div>
        <h1
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: COLORS.INK,
            margin: 0,
          }}
        >
          {BRAND.name}
        </h1>
        <p
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 20,
            lineHeight: 1.25,
            color: COLORS.INK_MUTED,
            margin: 0,
          }}
        >
          {BRAND.subtitle}
        </p>

        <div style={{ marginTop: 24 }}>
          <LabelValue
            label="Authors"
            value={STUDENTS.map((s) => s.name).join(" · ")}
          />
          <LabelValue label="Advisor" value="Samer Khamaiseh, Ph.D." />
          <LabelValue label="Course" value={`${INSTITUTION.course} · ${INSTITUTION.track}`} />
          <LabelValue label="Date" value="April 2026" />
          <LabelValue label="Edition" value="Expo · first printing" />
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: COLORS.INK_SUBTLE,
            lineHeight: 1.6,
          }}
        >
          © 2026 · {INSTITUTION.captionFull}
          <br />
          Typeset in Plus Jakarta Sans, Instrument Serif, Monaspace Neon.
          <br />
          Printed on 80 lb uncoated text · saddle-stitched.
        </div>
      </div>

      {/* Right column — TOC */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: TYPE.eyebrow.size,
            fontWeight: 600,
            letterSpacing: TYPE.eyebrow.tracking,
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
          }}
        >
          Contents
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
          {CHAPTERS.map((ch) => (
            <TocRow
              key={ch.num}
              num={ch.num}
              name={ch.name}
              pages={ch.pages}
              color={SECTION[ch.sectionKey]}
            />
          ))}
        </div>
      </div>
    </div>
  </Page>
);

const LabelValue: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "72px 1fr",
      alignItems: "baseline",
      marginBottom: 6,
    }}
  >
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: FONTS.SANS,
        fontSize: 12,
        fontWeight: 500,
        color: COLORS.INK,
        letterSpacing: "-0.005em",
      }}
    >
      {value}
    </div>
  </div>
);

const TocRow: React.FC<{
  num: string;
  name: string;
  pages: string;
  color: string;
}> = ({ num, name, pages, color }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "0.4in 36px 1fr auto",
      alignItems: "baseline",
      columnGap: 10,
      borderBottom: `0.5pt solid ${COLORS.HAIRLINE}`,
      paddingBottom: 8,
    }}
  >
    <div
      style={{
        width: "0.4in",
        height: 36,
        background: color,
        borderRadius: 2,
      }}
    />
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 18,
        fontWeight: 700,
        color: COLORS.INK,
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {num}
    </div>
    <div
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 22,
        color: COLORS.INK,
        lineHeight: 1,
      }}
    >
      {name}
    </div>
    <div
      style={{
        fontFamily: FONTS.MONO,
        fontSize: 10,
        fontWeight: 600,
        color: COLORS.INK_MUTED,
        letterSpacing: "0.04em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {pages}
    </div>
  </div>
);
