import { describe, expect, it } from "vitest";
import {
  createSourceToViewportTransform,
  mapCursorPathToViewport,
  mapSourcePointToViewport,
  mapSourceRectToViewport,
} from "../sourceToViewport";

describe("sourceToViewport", () => {
  it("supports contain-fit mapping for fullscreen demo captures", () => {
    const transform = createSourceToViewportTransform(
      { width: 1600, height: 1000 },
      { width: 1920, height: 1080 },
      "contain",
    );

    expect(transform.scale).toBe(1.08);
    expect(transform.offsetX).toBe(96);
    expect(transform.offsetY).toBe(0);
    expect(
      mapSourcePointToViewport({ x: 800, y: 500 }, transform),
    ).toEqual({ x: 960, y: 540 });
    expect(
      mapSourceRectToViewport({ x: 400, y: 200, w: 800, h: 400 }, transform),
    ).toEqual({ x: 528, y: 216, w: 864, h: 432 });
  });

  it("keeps cover-fit mapping available for browser-shell scenes", () => {
    const transform = createSourceToViewportTransform(
      { width: 1600, height: 1000 },
      { width: 1728, height: 848 },
      "cover",
    );

    expect(transform.scale).toBe(1.08);
    expect(transform.offsetX).toBe(0);
    expect(transform.offsetY).toBe(-116);
    expect(
      mapCursorPathToViewport(
        [{ at: 12, x: 800, y: 500, clickAt: 12 }],
        transform,
      ),
    ).toEqual([{ at: 12, x: 864, y: 424, clickAt: 12 }]);
  });
});
