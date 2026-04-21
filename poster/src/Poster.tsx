import React from "react";
import { COLORS, GRID } from "./tokens";
import { Header } from "./regions/Header";
import { Footer } from "./regions/Footer";
import { Section1Problem } from "./regions/Section1Problem";
import { Section2Product } from "./regions/Section2Product";
import { Section3Architecture } from "./regions/Section3Architecture";
import { Section4Results } from "./regions/Section4Results";
import { Section5Differentiators } from "./regions/Section5Differentiators";
import { Section6JourneyTeam } from "./regions/Section6JourneyTeam";

/**
 * Top-level poster composition. Structure:
 *
 *   ┌───────────────────── header · 48 × 3 ─────────────────────┐
 *   ├──────────────┬──────────────┬──────────────────────────────┤
 *   │  §1 Problem  │  §2 Product  │   §3 Architecture            │
 *   │   16 × 15    │   16 × 15    │     16 × 15                  │
 *   ├──────────────┼──────────────┼──────────────────────────────┤
 *   │  §4 Results  │  §5 The Edge │   §6 Journey & Team          │
 *   │   16 × 15    │   16 × 15    │     16 × 15                  │
 *   ├────────────────────── footer · 48 × 3 ────────────────────┤
 *   └───────────────────────────────────────────────────────────┘
 *
 * Both rows are a three-column 1fr 1fr 1fr split.
 *
 * All sections share the SectionFrame eyebrow/headline chrome so the
 * whole page reads as one composition rather than bespoke designs.
 */

export const Poster: React.FC = () => {
  const debug =
    typeof window !== "undefined" &&
    window.location.search.includes("debug-grid");

  return (
    <div className={`poster-root${debug ? " debug-grid" : ""}`}>
      <Header />
      <MainGrid />
      <Footer />
    </div>
  );
};

const MainGrid: React.FC = () => (
  <div
    style={{
      width: "100%",
      height: `${GRID.section.h * GRID.rows}in`,
      display: "grid",
      gridTemplateColumns: `repeat(${GRID.cols}, 1fr)`,
      gridTemplateRows: `repeat(${GRID.rows}, 1fr)`,
    }}
  >
    {/* Row 1 · three equal cells */}
    <Cell right bottom>
      <Section1Problem />
    </Cell>
    <Cell right bottom>
      <Section2Product />
    </Cell>
    <Cell bottom>
      <Section3Architecture />
    </Cell>

    {/* Row 2 · three equal cells (no bottom border — last row) */}
    <Cell right>
      <Section4Results />
    </Cell>
    <Cell right>
      <Section5Differentiators />
    </Cell>
    <Cell>
      <Section6JourneyTeam />
    </Cell>
  </div>
);

/** Grid cell wrapper that draws a 1px hairline along its right and/or bottom
 *  edge (but not on the rightmost column or bottom row). */
const Cell: React.FC<{
  children: React.ReactNode;
  right?: boolean;
  bottom?: boolean;
}> = ({ children, right, bottom }) => (
  <div
    style={{
      minWidth: 0,
      minHeight: 0,
      boxSizing: "border-box",
      borderRight: right ? `1px solid ${COLORS.HAIRLINE}` : "none",
      borderBottom: bottom ? `1px solid ${COLORS.HAIRLINE}` : "none",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);
