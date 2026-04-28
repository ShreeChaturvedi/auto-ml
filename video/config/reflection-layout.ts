import { ARCH_PALETTE } from "./arch-layout";
import type { RetroTone } from "./reflection-content";

/**
 * Tone palette shared across Slides 6-8. The three strokes deliberately echo
 * the Slide 2-4 sprint-range accents so the expo reel reads as one continuous
 * color chord from journey → retro.
 */
export const REFLECTION_TONES: Record<
  RetroTone,
  { stroke: string; tint: string }
> = {
  blue: {
    stroke: ARCH_PALETTE.accentBlue,
    tint: "rgba(29, 78, 216, 0.08)",
  },
  green: {
    stroke: ARCH_PALETTE.successGreenBright,
    tint: "rgba(16, 185, 129, 0.10)",
  },
  amber: {
    stroke: ARCH_PALETTE.amberBright,
    tint: "rgba(245, 158, 11, 0.10)",
  },
};

/** Slide 5 (AI Collaboration) layout. */
export const AI_LAYOUT = {
  title: { x: 120, y: 232, w: 1600 },
  cards: {
    y: 380,
    w: 528,
    h: 420,
    gap: 30,
    xs: [120, 678, 1236] as const,
    padding: 36,
  },
  tape: { x: 120, y: 860, w: 1680, h: 60 },
  methodStripY: 970,
} as const;

/** Slide 6-8 (retro trio) shared layout. */
export const RETRO_LAYOUT = {
  title: { x: 120, y: 232, w: 1200, fontSize: 56 },
  statements: {
    x: 120,
    y: 360,
    w: 1120,
    fontSize: 40,
    gap: 44,
    lineHeight: 1.35,
  },
  // Learned (text-only) tightens spacing so three statements breathe.
  statementsLearned: {
    x: 120,
    y: 360,
    w: 1680,
    fontSize: 36,
    gap: 32,
    lineHeight: 1.4,
  },
  // Right-rail anchor slot for WENT_WELL + DIFFERENTLY.
  anchorSlot: {
    x: 1280,
    y: 360,
    w: 520,
    h: 540,
  },
  graphNode: {
    x: 1340,
    w: 400,
    h: 72,
    yStart: 360,
    yStep: 180,
  },
  toolCall: {
    x: 1280,
    y: 400,
    w: 520,
  },
  methodStripY: 960,
} as const;
