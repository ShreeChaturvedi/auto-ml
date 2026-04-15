import type { MorphSpec } from "../types";

/**
 * Hero CTA ("Get Started" button) → Auth card. Used by Beat 2's
 * landing → login transition. Source bbox is in the 1920-wide
 * composition coord space.
 */
export const CTA_TO_LOGIN_CARD: MorphSpec = {
  sourceBbox: { x: 812, y: 438, w: 296, h: 44 },   // CTA on landing hero
  destBbox:   { x: 760, y: 260, w: 400, h: 560 },  // AuthCard centered
  sourceStyle: {
    background: "linear-gradient(180deg, #F7F8F8 0%, #E6E6E6 100%)",
    borderRadius: 6,
    boxShadow:
      "0 0 0 1px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)",
  },
  destStyle: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    boxShadow:
      "inset 0 0 40px rgba(255,255,255,0.02), 0 20px 60px rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  durationFrames: 40,
  spring: "SPRING_UI",
} as const;
