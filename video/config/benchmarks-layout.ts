import { ARCH_PALETTE } from "./arch-layout";

/** 5 new tokens — additive overlay; reuses arch tokens elsewhere so the
 *  benchmark section reads as one piece with the architecture arc. */
export const BENCHMARKS_PALETTE = {
  competitorGrey: "#9CA3AF", // Jupyter / sklearn baselines
  competitorAmber: ARCH_PALETTE.amberBright, // AutoGluon (re-export alias)
  trapCaughtGreen: ARCH_PALETTE.successGreenBright, // Guardrail caught state
  trapMissedRed: "#DC2626", // Guardrail missed (saturated; distinct from #F87171 redFlash)
  trapNeutral: "#E5E7EB", // Pre-flip resting fill
  topTierTint: "rgba(16,185,129,0.10)", // PercentileGauge top-N% wash
} as const;

/** Sequence-counter layout (shared across all 4 slides).
 *  Mirrors the ArchHookSlide pattern: top-right monospace "01 / 04". */
export const SEQ_COUNTER = {
  right: 200,
  top: 96,
  fontSize: 14,
} as const;

/** Methodology footnote layout (shared across all 4 slides).
 *  Lives 70px above the SlideFooter baseline (footer baseline = 40). */
export const METHOD_STRIP = {
  left: 120, // SAFE_AREA.contentLeft
  bottom: 110,
  fontSize: 14,
  letterSpacing: "0.05em",
} as const;

/** Slide-specific pixel-coordinate constants. All y values constrained
 *  to ≤ 920 (above the methodology strip) per pixel audit. */
export const HOOK = {
  title: { left: 120, top: 232, width: 1600 },
  flourish: { width: "100%" as const },
  // 3 × 460 + 2 × 75 = 1530, fits in 1704 content width.
  pillarRow: {
    top: 380,
    cardW: 460,
    cardH: 300,
    gap: 75,
    x: [120, 695, 1270] as const,
  },
} as const;

export const SPEED = {
  title: { left: 120, top: 232, width: 1600 },
  // 5 rows × 116 + 4 × 4 = 596 ≤ 600. Track width after gutters: 1100 − 220 − 96 = 784.
  bars: {
    x: 120,
    y: 320,
    w: 1100,
    h: 600,
    rowH: 116,
    rowGap: 4,
    labelGutterW: 220,
    valueGutterW: 96,
    scaleMax: 40,
  },
  hero: { x: 1260, y: 360, w: 540 }, // hero numeral right rail
  saved: { x: 1260, y: 600, w: 540 }, // "minutes saved" sub-counter
} as const;

export const QUALITY = {
  title: { left: 120, top: 232, width: 1600 },
  gauge: { x: 120, y: 340, w: 1680, trackH: 28 },
  // 5 × 320 + 4 × 20 = 1680 (fits content width).
  cards: {
    y: 460,
    w: 320,
    h: 200,
    gap: 20,
    x: [120, 460, 800, 1140, 1480] as const,
  },
  legend: { x: 120, y: 700, fontSize: 13 }, // tier-tint legend
} as const;

export const GUARDRAILS = {
  title: { left: 120, top: 232, width: 1600 },
  legend: { x: 120, y: 292, fontSize: 12 }, // "2 pts each · 10 flaws · 20 max · …"
  // Single unified 10-row table. Columns:
  //   id (32) + label (flex, max ~900) + usStatus (140 centered) + sklearnStatus (140 centered).
  //   10 rows × 40h + 9 × 4 gap = 436h. Rows span y=370..806.
  table: {
    x: 200,
    y: 370,
    w: 1520,
    rowH: 40,
    rowGap: 4,
    idW: 32,
    // Absolute x for the 14×14 status dots (anchored to row's own coord space).
    usDotX: 1100,
    sklearnDotX: 1400,
  },
  // Column headers + hairlines, centered over each status column.
  headers: {
    y: 330,
    hairlineY: 356,
    hairlineW: 96,
    usCenterX: 1100, // matches table.usDotX
    sklearnCenterX: 1400, // matches table.sklearnDotX
  },
  // Hero band lives below the table. Methodology strip sits at y=970.
  hero: { y: 820, h: 140 }, // bottom = 960; clears the 970 strip.
} as const;
