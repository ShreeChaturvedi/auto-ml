/**
 * Shared types for the capture orchestrator and per-beat drivers. Kept in a
 * tiny module so `capture-demo.ts` and every driver agree on the cursor +
 * pacer shapes without circular deps.
 */
import type { Page } from "playwright";

/** One entry in `<beat>.cursor.json`, matching `CursorTrackEntry` in the scene. */
export type CursorEntry = {
  t_ms: number;
  x: number;
  y: number;
  click?: boolean;
};

/** Captured metadata sidecar for each beat. */
export type CaptureMeta = {
  fps: number;
  width: number;
  height: number;
  durationMs: number;
};

/** Driver-facing cursor API. `move`/`click` each record one entry. */
export type CursorRecorder = {
  move: (page: Page, x: number, y: number, steps?: number) => Promise<void>;
  click: (page: Page, x: number, y: number) => Promise<void>;
  entries: () => readonly CursorEntry[];
};

/** rAF-eased scroll helper. `durationMs` controls the full scroll length. */
export type RafScroll = (
  page: Page,
  targetY: number,
  durationMs: number,
) => Promise<void>;

/** VO-aligned pacer. If no alignment file exists, `waitForMark` is a no-op. */
export type MarkPacer = {
  hasAlignment: boolean;
  waitForMark: (markName: string) => Promise<void>;
};
