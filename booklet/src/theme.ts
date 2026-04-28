/**
 * Booklet design tokens.
 *
 * COLORS and FONTS are re-exported from the poster's tokens so the three
 * visual artifacts (video · poster · booklet) share one palette. TYPE is
 * booklet-specific because print page-size text cannot reuse the poster's
 * 48"-canvas scale. SECTION aliases the 5 divider colors to canonical
 * poster tokens — no new hex values are introduced here.
 */

import { COLORS as POSTER_COLORS, FONTS as POSTER_FONTS } from "../../poster/src/tokens";

// ---------------------------------------------------------------------------
// Palette — single source of truth is /poster/src/tokens.ts. Booklet adds
// only the two cover-art surface colors, which are contextual to the
// wraparound diorama and don't belong in the shared poster palette.
// ---------------------------------------------------------------------------

export const COLORS = {
  ...POSTER_COLORS,
  /** Warm cream used for the cover/back-cover terrain diorama ground. */
  PAPER_WARM: "#F5F3F0",
  /** Teal extension used only inside the cover contour-line gradient. */
  TEAL_EXT: "#5DADE2",
} as const;

export const FONTS = POSTER_FONTS;

// ---------------------------------------------------------------------------
// Section color map — each of the 5 chapters owns one divider color plus the
// eyebrow color used in its content pages' page-number footer.
// Aliases only; no new hex.
// ---------------------------------------------------------------------------

export const SECTION = {
  "01_WHY":    COLORS.MIAMI_RED,
  "02_HOW":    COLORS.ACCENT,
  "03_INSIDE": COLORS.INK,
  "04_PROOF":  COLORS.SUCCESS,
  "05_BUILD":  COLORS.AMBER,
} as const;

export type SectionKey = keyof typeof SECTION;

// ---------------------------------------------------------------------------
// Typography — sized for a held-in-hand 8.5"×11" page. Every component that
// renders text must pull its size/weight/tracking from here.
//
// NOTE ON UNITS: `size` values are CSS **pixels** (not points, despite the
// earlier comment). When rendered into a PDF at 96 CSS DPI, printed
// point-size = px ÷ 1.333. Visual audit at 300 dpi confirms the current
// ladder passes legibility; do NOT reflow the book to convert to pt.
// ---------------------------------------------------------------------------

export const TYPE = {
  // Display — cover title, divider numbers
  display:       { size: 220, weight: 700, tracking: "-0.025em", lh: 0.95 },
  displayMedium: { size: 112, weight: 700, tracking: "-0.025em", lh: 1 },

  // Section title on divider pages (italic serif)
  sectionTitle: { size: 80, weight: 400, tracking: "0", lh: 1, italic: true },

  // Page headlines and subheads
  h1: { size: 36, weight: 700, tracking: "-0.015em", lh: 1.1 },
  h2: { size: 22, weight: 500, tracking: "-0.015em", lh: 1.2 },

  // Italic serif subheads (used in Agent 8's upcoming section intros).
  subheadLarge:  { size: 20, weight: 400, italic: true, lh: 1.2 },
  subheadMedium: { size: 18, weight: 400, italic: true, lh: 1.25 },
  subheadSmall:  { size: 14, weight: 400, italic: true, lh: 1.3 },

  // Body
  body: { size: 11, weight: 400, tracking: "-0.005em", lh: 1.45 },

  // Pull quotes (serif italic)
  pullQuote:       { size: 28, weight: 400, tracking: "0", lh: 1.25, italic: true },
  pullQuoteSmall:  { size: 24, weight: 400, tracking: "0", lh: 1.25, italic: true },

  // Supporting — bumped from 9 → 10 to clear the gray-trap threshold on
  // uncoated 80lb stock (9px ≈ 6.75pt effective, which ink-spreads to mush).
  caption: { size: 10, weight: 500, tracking: "0.02em", lh: 1.25 },
  mono:    { size: 10, weight: 500, tracking: "0.04em", lh: 1.2 },
  pageNum: { size: 9,  weight: 500, tracking: "0.04em", lh: 1 },

  // Monaspace UPPERCASE eyebrow — the recurring anchor at the top of every
  // content section and in page-number rails. Agent 1 bumped size 9→10.
  eyebrow: { size: 10, weight: 500, tracking: "0.12em", lh: 1 },

  // Eyebrow on divider pages (larger, white on color). Tracking capped at 0.12em
  // per typography pass — larger optical size needs less extra tracking.
  eyebrowLarge: { size: 14, weight: 500, tracking: "0.12em", lh: 1 },

  // Subtitle under divider number (white, Plus Jakarta 24pt)
  dividerSubtitle: { size: 24, weight: 400, tracking: "-0.01em", lh: 1.2 },

  // Small caps on approval-gate callout
  approvalLabel: { size: 10, weight: 600, tracking: "0.18em", lh: 1 },
} as const;

// ---------------------------------------------------------------------------
// Page geometry — 8.5"×11" trim, 0.125" bleed on dividers/covers, 4-col grid.
// Expressed in inches so CSS can consume directly.
// ---------------------------------------------------------------------------

export const PAGE = {
  /** Trim size, in inches. */
  trimW: 8.5,
  trimH: 11,
  /** Bleed for full-bleed art. */
  bleedIn: 0.125,
  /** Content-page margins. */
  margin: {
    outer:  0.75,
    top:    0.875,
    bottom: 1.0,
    inner:  0.75,
  },
  /** 4-column grid, 0.25" gutters. */
  grid: {
    cols: 4,
    gutterIn: 0.25,
  },
} as const;

// ---------------------------------------------------------------------------
// Card chrome — matches poster CARD tokens so any visual ported from the
// poster keeps its elevation system.
// ---------------------------------------------------------------------------

export const CARD = {
  bg: COLORS.PAPER_ELEVATED,
  border: `1px solid ${COLORS.HAIRLINE}`,
  radius: 6,
  padding: 10,
} as const;
