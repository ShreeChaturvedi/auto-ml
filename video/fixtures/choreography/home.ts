import type { ChoreographyPieceList } from "../types";

/**
 * Beat 2 — Home dashboard assembly (after signup→home transition).
 *
 * Order (see plan §2.4) reflects the real `HomePage.tsx` empty-state
 * surface that mounts inside `HomeScreen`:
 *   greeting → empty-icon → title → description → buttons → learn-more
 *
 * Each piece's `start` is a frame offset relative to the scene start.
 *
 * ## Status
 *
 * Currently DOCUMENTATION ONLY. `HomeScreen` mounts the real HomePage
 * directly (no Assemble wrapping). Same trade-off as `login.ts` — see
 * that file for the full rationale.
 */
export const HOME_ASSEMBLY: ChoreographyPieceList = [
  { id: "greeting",    start: 30,  from: "bottom", duration: 20 },
  { id: "empty-icon",  start: 46,  from: "scale",  duration: 22 },
  { id: "title",       start: 60,  from: "bottom", duration: 20 },
  { id: "description", start: 72,  from: "bottom", duration: 20 },
  { id: "buttons",     start: 88,  from: "bottom", duration: 22 },
  { id: "learn-more",  start: 108, from: "bottom", duration: 18 },
] as const;
