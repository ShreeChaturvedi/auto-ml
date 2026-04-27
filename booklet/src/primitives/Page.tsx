import React from "react";
import { COLORS, PAGE } from "../theme";
import { PageNumber } from "./PageNumber";

/**
 * Base content-page wrapper. Renders a fixed 8.5"×11" box with the standard
 * asymmetric margins (0.75" outer, 0.875" top, 1" bottom) and the page-number
 * footer rail. Full-bleed pages (covers, dividers) don't use this wrapper;
 * they render straight into `.page`.
 *
 * Margin convention:
 *   · `parity === "recto"` (right-hand page) — outer margin is on the right.
 *   · `parity === "verso"` (left-hand page)  — outer margin is on the left.
 *
 * The asymmetry matters once the booklet is bound — the inner (gutter) edge
 * needs a slightly different margin than the outer (thumb) edge.
 */

export type PageProps = {
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
  sectionLabel: string;
  sectionColor: string;
  children: React.ReactNode;
  /** If set, overrides the page-level background (for e.g. endpaper). */
  background?: string;
  /** Hide the page-number footer (used on title pages). */
  hideFooter?: boolean;
};

export const Page: React.FC<PageProps> = ({
  parity,
  pageNumber,
  totalPages,
  sectionLabel,
  sectionColor,
  children,
  background = COLORS.PAPER,
  hideFooter = false,
}) => {
  // Recto (right): outer margin is on the right.
  // Verso (left):  outer margin is on the left.
  const outerRight = parity === "recto" ? PAGE.margin.outer : PAGE.margin.inner;
  const outerLeft = parity === "recto" ? PAGE.margin.inner : PAGE.margin.outer;
  return (
    <section
      className="page"
      style={{
        background,
        paddingTop: `${PAGE.margin.top}in`,
        paddingBottom: `${PAGE.margin.bottom}in`,
        paddingLeft: `${outerLeft}in`,
        paddingRight: `${outerRight}in`,
      }}
    >
      {children}
      {!hideFooter && (
        <PageNumber
          sectionLabel={sectionLabel}
          sectionColor={sectionColor}
          pageNumber={pageNumber}
          totalPages={totalPages}
          parity={parity}
        />
      )}
    </section>
  );
};
