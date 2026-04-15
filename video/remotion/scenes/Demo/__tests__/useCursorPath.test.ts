import { describe, expect, it } from "vitest";
import { cursorJsonToWaypoints } from "../cursorJson";

describe("cursorJsonToWaypoints", () => {
  it("maps a single entry at t_ms 0 to frame 0 with no clickAt", () => {
    const out = cursorJsonToWaypoints([{ t_ms: 0, x: 100, y: 200 }], 60);
    expect(out).toEqual([{ at: 0, x: 100, y: 200, clickAt: undefined }]);
  });

  it("converts t_ms → frame at 60 fps and lifts click into clickAt", () => {
    const out = cursorJsonToWaypoints(
      [{ t_ms: 1000, x: 50, y: 75, click: true }],
      60,
    );
    expect(out).toEqual([{ at: 60, x: 50, y: 75, clickAt: 60 }]);
  });

  it("converts a mixed sequence at 30 fps; only clicking entries get clickAt", () => {
    const out = cursorJsonToWaypoints(
      [
        { t_ms: 0, x: 0, y: 0 },
        { t_ms: 500, x: 10, y: 10, click: true },
      ],
      30,
    );
    expect(out).toEqual([
      { at: 0, x: 0, y: 0, clickAt: undefined },
      { at: 15, x: 10, y: 10, clickAt: 15 },
    ]);
  });

  it("returns an empty list for empty input", () => {
    expect(cursorJsonToWaypoints([], 60)).toEqual([]);
  });
});
