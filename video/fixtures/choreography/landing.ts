import type { ChoreographyPieceList } from "../types";

/**
 * Beat 1 — Landing hero assembly (atop the existing landing scroll shell).
 *
 * TODO: Order (see plan §1.4):
 *   eyebrow → headline → subhead → bullets → primaryCta → secondaryCta →
 *   productPreview → trustRow
 *
 * Each piece's `start` is a frame offset relative to the scene start and
 * should chain via { after: "prevId" } triggers where possible so the
 * reveal feels like a single gesture.
 */
export const LANDING_ASSEMBLY: ChoreographyPieceList = [] as const;
