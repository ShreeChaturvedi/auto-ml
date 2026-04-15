import type { CursorWaypoint } from "../../primitives/SyntheticCursor";

/** Raw cursor-track record written by the Playwright capture driver. */
export type CursorTrackEntry = {
  t_ms: number;
  x: number;
  y: number;
  click?: boolean;
};

/**
 * Converts Playwright-captured cursor JSON entries to `SyntheticCursor`
 * waypoints. Each entry's `t_ms` is rounded to the nearest frame at `fps`
 * and `click: true` lifts the same frame into `clickAt` so the cursor emits
 * a `ClickRipple`.
 */
export const cursorJsonToWaypoints = (
  entries: readonly CursorTrackEntry[],
  fps: number,
): readonly CursorWaypoint[] =>
  entries.map((e) => {
    const at = Math.round((e.t_ms / 1000) * fps);
    return {
      at,
      x: e.x,
      y: e.y,
      clickAt: e.click ? at : undefined,
    };
  });
