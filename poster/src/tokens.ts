/**
 * Design tokens — single source of truth for colors, fonts, and sizes.
 *
 * Typography uses a strict 6-step scale so every section on the poster
 * reads in the same voice. No ad-hoc font sizes inside regional components —
 * everything pulls from `TYPE` or this file must be updated.
 */

// ---------------------------------------------------------------------------
// Color palette — mirrors video/config/themes.ts (light theme only).
// ---------------------------------------------------------------------------

export const COLORS = {
  PAPER: "#FFFFFF",
  PAPER_ELEVATED: "#FAFAFA",
  SURFACE: "#F5F5F5",
  HAIRLINE: "#A3A3A3",
  HAIRLINE_STRONG: "#737373",
  INK: "#171717",
  INK_MUTED: "rgba(23, 23, 23, 0.62)",
  INK_SUBTLE: "rgba(23, 23, 23, 0.38)",
  ACCENT: "#1D4ED8", // blue-700, product accent
  ACCENT_DEEP: "#1E3A8A", // blue-900, text that must read on paper
  ACCENT_TINT: "rgba(29, 78, 216, 0.08)",
  ACCENT_RING: "rgba(29, 78, 216, 0.15)",
  // Miami Red — canonical Pantone 186 C / CMYK 0-100-81-4 / Hex #C8102E.
  // Source: Miami University Brand Style Guide (miamioh.edu/umc/brand).
  MIAMI_RED: "#C8102E",
  DIVIDER_TAN: "#CCC9B8",
  SUCCESS: "#16A34A",
  SUCCESS_TINT: "rgba(22, 163, 74, 0.10)",
  DANGER: "#DC2626",
  DANGER_TINT: "rgba(220, 38, 38, 0.08)",
  AMBER: "#D97706",
  AMBER_TINT: "rgba(217, 119, 6, 0.10)",
  MIAMI_RED_TINT: "rgba(200, 16, 46, 0.08)",
  MIAMI_RED_TINT_STRONG: "rgba(200, 16, 46, 0.18)",
  NEUTRAL_300: "#D4D4D4",
  NEUTRAL_400: "#9CA3AF",
  NEUTRAL_500: "#6B7280",
  NEUTRAL_600: "#4B5563",
  NEUTRAL_700: "#374151",
  SYNTAX_KEYWORD: "#7C3AED",
  SYNTAX_STRING: "#059669",
  SYNTAX_NUMBER: "#DC2626",
  SYNTAX_COMMENT: "#6B7280",
} as const;

/** Miami Red / Divider Tan gradient rule, lifted from themes.ts:118. */
export const MIAMI_DIVIDER_GRADIENT = `linear-gradient(to right, ${COLORS.MIAMI_RED} 0%, ${COLORS.MIAMI_RED} 25%, ${COLORS.DIVIDER_TAN} 25%, ${COLORS.DIVIDER_TAN} 100%)`;

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

export const FONTS = {
  SANS: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
  SERIF: '"Instrument Serif", Georgia, "Times New Roman", serif',
  MONO: '"Monaspace Neon", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

// ---------------------------------------------------------------------------
// Unified typography scale. Every region's eyebrow, headline, body, caption,
// and data cell pulls from here. No region defines its own font size.
//
// Sizes are printer's points (72 pt = 1 in). Line-heights are bare numbers.
// ---------------------------------------------------------------------------

export const TYPE = {
  // Poster wordmark (header only) — big but not absurd so subtitle fits
  wordmark: { size: 112, weight: 700, tracking: "-0.025em", lh: 1 },

  // The single hero tagline under the wordmark
  heroTagline: { size: 54, weight: 400, tracking: "-0.005em", lh: 1.1 },

  // Section eyebrow — same everywhere: "§1 · PROBLEM"
  eyebrow: { size: 24, weight: 600, tracking: "0.2em", lh: 1 },

  // Section headline — same everywhere
  headline: { size: 58, weight: 700, tracking: "-0.02em", lh: 1.08 },

  // Body text
  body: { size: 26, weight: 500, tracking: "-0.005em", lh: 1.4 },

  // Lead-in body paragraph — the one-sentence descriptive paragraph
  // directly under a section headline (used in §2 and §3). Sized up so
  // the reader is pulled in before they reach the visual.
  leadBody: { size: 30, weight: 500, tracking: "-0.005em", lh: 1.35 },

  // Supporting caption (under a visual, or methodology)
  caption: { size: 20, weight: 500, tracking: "0.02em", lh: 1.35 },

  // Monospace data cell (table rows, numbers)
  dataCell: { size: 24, weight: 500, tracking: "0", lh: 1.2 },

  // Small monospace footnote
  footnote: { size: 18, weight: 500, tracking: "0.04em", lh: 1.3 },

  // -------------------------------------------------------------------------
  // Metric tier ladder — every big number on the poster MUST pull its
  // fontSize/weight/letterSpacing from one of these five rungs so the
  // numerical voice is consistent across §1, §3, §4, §5, §6.
  //
  //   metricHero    88  §4 tier numbers (7×, 16/20, TOP 15%)
  //   metricLarge   64  §1 fact strip values
  //   metricMedium  50  §5 totals row (commits, issues, MRs, active days)
  //   metricSmall   36  §3 ledger row counts
  //   metricCompact 30  §4 quality cells, §6 By-the-Numbers stats
  //
  // Tiers are mono 700 with tabular-nums and a tight tracking. Every
  // `fontFamily: FONTS.MONO, fontWeight: 700, fontVariantNumeric:
  // "tabular-nums"` block in a region should be expressed in terms of one
  // of these tokens (do not inline a fontSize).
  // -------------------------------------------------------------------------
  metricHero: { size: 88, weight: 700, tracking: "-0.03em", lh: 0.95 },
  metricLarge: { size: 64, weight: 700, tracking: "-0.02em", lh: 1 },
  metricMedium: { size: 50, weight: 700, tracking: "-0.03em", lh: 1 },
  metricSmall: { size: 36, weight: 700, tracking: "-0.02em", lh: 1 },
  metricCompact: { size: 30, weight: 700, tracking: "-0.02em", lh: 1 },

  // Small uppercase label that sits ABOVE a metric tier (e.g. "SPEED",
  // "GUARDRAILS", "QUALITY"). Used by §4 tier shells, §6 By-the-Numbers
  // cards, §3 ledger header. Same tracking rhythm as eyebrow but smaller.
  metricLabel: { size: 14, weight: 700, tracking: "0.16em", lh: 1 },

  // Serif pull quote
  pullQuote: { size: 40, weight: 400, tracking: "0.005em", lh: 1.25 },

  // Team person name
  personName: { size: 30, weight: 700, tracking: "-0.01em", lh: 1.15 },

  // Team person role (small caps)
  personRole: { size: 17, weight: 600, tracking: "0.1em", lh: 1.2 },

  // Institutional caption "CSE 449 · Senior Design Project · 2026"
  institutional: {
    size: 18,
    weight: 500,
    tracking: "0.14em",
    lh: 1.2,
  },

  // Eyebrow-like sub-label used inside a region (slightly smaller than
  // section eyebrow so it doesn't compete). Example: "Milestones",
  // "With Gratitude", tier labels.
  subEyebrow: { size: 18, weight: 700, tracking: "0.14em", lh: 1.2 },
} as const;

// ---------------------------------------------------------------------------
// Card chrome — one shape for every "container" on the poster. Cards in
// §1 (fact strip), §2 (capability cards), §3 (ledger strip), §4 (ChartCard
// + quality cells), §5 (totals row), §6 (AI brand chips, By-the-Numbers)
// must all use these tokens so the poster reads as one elevation system.
//
// Use as inline style:
//   { background: CARD.bg, border: CARD.border, borderRadius: CARD.radius,
//     padding: CARD.padding }
// ---------------------------------------------------------------------------

export const CARD = {
  bg: COLORS.PAPER_ELEVATED,
  border: `1px solid ${COLORS.HAIRLINE}`,
  radius: 10,
  padding: 16,
} as const;

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/** Convert a `#rrggbb` hex color into an `rgba()` string with the given alpha. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Poster grid:
 *   • header      48in × 3in
 *   • main        48in × 30in  (2 rows × 3 columns, each cell 16in × 15in)
 *   • footer      48in × 3in
 *
 * Total: 3 + 15 + 15 + 3 = 36 ✓
 */
export const GRID = {
  header: { h: 3 },
  footer: { h: 3 },
  section: { w: 16, h: 15 },
  rows: 2,
  cols: 3,
} as const;
