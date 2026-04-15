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
 *
 * `startOffsetSeconds` rebases waypoints when the scene trims the head of the
 * video via `<OffthreadVideo startFrom>` — cursor `t_ms` is recorded in
 * webm-time but `at` must be in scene-time so cursor positions track the
 * trimmed video. Entries before the trim point are dropped.
 */
export const cursorJsonToWaypoints = (
  entries: readonly CursorTrackEntry[],
  fps: number,
  startOffsetSeconds: number = 0,
): readonly CursorWaypoint[] => {
  const offsetFrames = Math.round(startOffsetSeconds * fps);
  const shifted: CursorWaypoint[] = [];
  for (const e of entries) {
    const at = Math.round((e.t_ms / 1000) * fps) - offsetFrames;
    if (at < 0) continue;
    shifted.push({
      at,
      x: e.x,
      y: e.y,
      clickAt: e.click ? at : undefined,
    });
  }
  return shifted;
};
