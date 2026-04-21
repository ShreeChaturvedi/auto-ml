import { ARCH_PALETTE } from "./arch-layout";

/**
 * Palette tokens shared across the 4 journey slides.
 * Each sprint-range cell references its own accent; the barBase is a neutral
 * grey that each weekly bar blends toward its sprint accent at 18% mix.
 */
export const JOURNEY_PALETTE = {
  foundationAccent: ARCH_PALETTE.accentBlue, // #1D4ED8
  agenticAccent: ARCH_PALETTE.successGreenBright, // #10B981
  productionAccent: ARCH_PALETTE.amberBright, // #F59E0B
  barBase: "#E5E7EB", // neutral grey before sprint tint
  gridHairline: ARCH_PALETTE.hairline,
  peakTint: "rgba(245, 158, 11, 0.18)", // amber wash under peak week
  pulseAccent: ARCH_PALETTE.miamiRed, // marker color for Slide 1
} as const;

export type JourneyRange = "pulse" | "foundation" | "agentic" | "production";

/** Maps a journey range key to its accent color. */
export const RANGE_ACCENT: Record<JourneyRange, string> = {
  pulse: JOURNEY_PALETTE.pulseAccent,
  foundation: JOURNEY_PALETTE.foundationAccent,
  agentic: JOURNEY_PALETTE.agenticAccent,
  production: JOURNEY_PALETTE.productionAccent,
};

/**
 * Pixel-coordinate geometry for the journey section.
 * The header cells are pixel-identical across Slides 1-4 so the active-range
 * marker reads as one pill translating + recoloring between cuts.
 */
export const JOURNEY_LAYOUT = {
  // 3-cell sprint-band header (pulse slide renders all cells dimmed; slides
  // 2-4 light up one cell at a time). Cells are 340 px each so the longest
  // label ("SPRINTS 5-8 · THE AGENTIC TURN", 30 chars @ 13-px mono) fits on
  // one line — the earlier 272-px cells forced TURN onto a second line.
  header: {
    cellY: 108,
    cellW: 340,
    cellH: 44,
    cellX: [120, 480, 840] as const,
    markerY: 148,
    markerH: 2,
    // Slide 1 marker spans all 3 cells + in-between gaps = 1060 anchored at cellX[0].
    pulseMarkerX: 120,
    pulseMarkerW: 1060,
  },

  // Slide 1 chart + callout positions.
  chart: {
    x: 120,
    y: 400,
    w: 1704,
    h: 340,
    peakHeightPx: 300,
    barGap: 8,
  },

  // Slide 1 axis (bar baseline) + month ticks y.
  axis: {
    y: 720,
    monthLabelY: 744,
  },

  // Slide 1 peak pill + leader line.
  peakPill: {
    y: 360,
    padX: 14,
    padY: 8,
  },

  // Slides 2-4 hero line under the header.
  heroLine: {
    x: 120,
    y: 212,
    w: 1680,
    fontSize: 40,
    lineHeight: 1.2,
  },

  // Slides 2-4 MetricCards — row of 3.
  metrics: {
    y: 360,
    cardW: 380,
    cardH: 220,
    gap: 40,
    xs: [120, 540, 960] as const,
  },

  // Slides 2-4 right-rail milestone list.
  milestones: {
    x: 1400,
    y: 360,
    w: 420,
    rowH: 80,
  },

  // Slides 2-4 hero moment area (production's 151 / agentic pill).
  heroMoment: {
    x: 960,
    y: 680,
    w: 460,
    h: 200,
  },

  // Methodology strip (Slide 1 bottom-left).
  methodStripY: 960,

  // Contributor footer (Slide 1 bottom-right).
  contributorStripY: 960,
} as const;
