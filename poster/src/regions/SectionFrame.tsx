import React from "react";
import { COLORS, FONTS, TYPE } from "../tokens";
import { CaptionPipe } from "../visuals/CaptionPipe";

/**
 * Footnote row — small uppercase label chip followed by a readable sans
 * sentence. Sized so judges don't squint at 5ft. Used only inside
 * SectionFrame; the component isn't exported.
 */
const SectionFootnoteRow: React.FC<{ value: string | SectionFootnote }> = ({
  value,
}) => {
  const { label, text }: SectionFootnote =
    typeof value === "string" ? { text: value } : value;
  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 14,
        borderTop: `1px solid ${COLORS.HAIRLINE}`,
        display: "flex",
        alignItems: "baseline",
        gap: 14,
      }}
    >
      {label && (
        <span
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: COLORS.MIAMI_RED,
            padding: "3px 10px",
            background: COLORS.MIAMI_RED_TINT,
            borderRadius: 4,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      )}
      <span
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 20,
          fontWeight: 500,
          color: COLORS.INK,
          lineHeight: 1.35,
          letterSpacing: "-0.005em",
        }}
      >
        {text}
      </span>
    </div>
  );
};

/**
 * Shared frame every section uses. Enforces identical eyebrow rhythm,
 * headline size, and internal padding, so the 2 × 3 grid of sections reads
 * as one coherent composition rather than six bespoke designs.
 *
 * Layout inside a section:
 *
 *   [eyebrow · number]
 *   [headline (single line or two lines)]
 *   ───── hairline ─────
 *   [body content — flex 1]
 *   [optional caption / method footnote at bottom]
 */

export type SectionFootnote = {
  /** Small uppercased label like "SOURCE", "METHOD" — acts as a prefix chip. */
  label?: string;
  /** The actual citation / method text — plain sentence case, readable size. */
  text: string;
};

export type SectionFrameProps = {
  eyebrow: string; // e.g. "PROBLEM"
  number: string; // e.g. "§1"
  headline: string;
  /**
   * Methodology / source footnote. May be a bare string (treated as `text`)
   * for backwards compatibility, or a `{ label, text }` object that the frame
   * renders as a small uppercase chip + readable sans-serif sentence.
   */
  footnote?: string | SectionFootnote;
  children: React.ReactNode;
  /** Right-aligned content inside the eyebrow row. Rarely used. */
  aside?: React.ReactNode;
};

const SECTION_PADDING = 48;

export const SectionFrame: React.FC<SectionFrameProps> = ({
  eyebrow,
  number,
  headline,
  footnote,
  children,
  aside,
}) => (
  <section
    style={{
      width: "100%",
      height: "100%",
      padding: SECTION_PADDING,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      overflow: "hidden",
    }}
  >
    {/* Eyebrow row: number · label · optional aside */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: FONTS.SANS,
        fontSize: TYPE.eyebrow.size,
        fontWeight: TYPE.eyebrow.weight,
        letterSpacing: TYPE.eyebrow.tracking,
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
        lineHeight: TYPE.eyebrow.lh,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            fontFamily: FONTS.MONO,
            fontWeight: 500,
            letterSpacing: "0.04em",
            color: COLORS.INK,
          }}
        >
          {number}
        </span>
        <CaptionPipe gap={0} />
        <span>{eyebrow}</span>
      </div>
      {aside}
    </div>

    {/* Headline */}
    <h2
      style={{
        margin: "16px 0 0",
        fontFamily: FONTS.SANS,
        fontSize: TYPE.headline.size,
        fontWeight: TYPE.headline.weight,
        letterSpacing: TYPE.headline.tracking,
        lineHeight: TYPE.headline.lh,
        color: COLORS.INK,
      }}
    >
      {headline}
    </h2>

    {/* Hairline separator */}
    <div
      style={{
        marginTop: 20,
        marginBottom: 24,
        height: 1,
        background: COLORS.HAIRLINE,
      }}
    />

    {/* Body content */}
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>

    {/* Footnote — readable provenance strip with an optional label chip. */}
    {footnote && <SectionFootnoteRow value={footnote} />}
  </section>
);
