import React from "react";
import { COLORS, FONTS, TYPE } from "../theme";
import { Page } from "../primitives/Page";
import { Eyebrow } from "../primitives/Eyebrow";

/**
 * Flexible body-page template — the workhorse for narrative content,
 * diagrams, and hero-stat pages. Sub-components render directly inside
 * `children`; the template just handles the eyebrow / headline chrome.
 */
export type BodyPageProps = {
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
  sectionLabel: string;
  sectionColor: string;
  eyebrow?: string;
  headline?: string;
  headlineSize?: keyof typeof TYPE;
  children: React.ReactNode;
};

export const BodyPage: React.FC<BodyPageProps> = ({
  parity,
  pageNumber,
  totalPages,
  sectionLabel,
  sectionColor,
  eyebrow,
  headline,
  headlineSize = "h1",
  children,
}) => {
  const h = TYPE[headlineSize] as typeof TYPE.h1;
  return (
    <Page
      parity={parity}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionLabel={sectionLabel}
      sectionColor={sectionColor}
    >
      {eyebrow && (
        <Eyebrow color={sectionColor} style={{ marginBottom: 10 }}>
          {eyebrow}
        </Eyebrow>
      )}
      {headline && (
        <h1
          style={{
            fontFamily: FONTS.SANS,
            fontSize: h.size,
            fontWeight: h.weight,
            letterSpacing: h.tracking,
            lineHeight: h.lh,
            color: COLORS.INK,
            margin: "0 0 14px",
          }}
        >
          {headline}
        </h1>
      )}
      {children}
    </Page>
  );
};
