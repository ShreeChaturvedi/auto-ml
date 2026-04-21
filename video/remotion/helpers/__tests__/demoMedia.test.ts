import { describe, expect, it } from "vitest";

import {
  getCaptureMediaDurationFrames,
  getPreviewVideoCandidates,
} from "../demoMedia";

describe("getPreviewVideoCandidates", () => {
  it("prefers an mp4 mirror before a webm source", () => {
    expect(
      getPreviewVideoCandidates("/static-demo/captures/landing.webm"),
    ).toEqual([
      "/static-demo/captures/landing.mp4",
      "/static-demo/captures/landing.webm",
    ]);
  });

  it("preserves media fragments when deriving preview fallbacks", () => {
    expect(
      getPreviewVideoCandidates("/static-demo/captures/landing.webm#t=1,61"),
    ).toEqual([
      "/static-demo/captures/landing.mp4#t=1,61",
      "/static-demo/captures/landing.webm#t=1,61",
    ]);
  });

  it("leaves non-webm sources unchanged", () => {
    expect(getPreviewVideoCandidates("/static-demo/captures/landing.mp4")).toEqual([
      "/static-demo/captures/landing.mp4",
    ]);
  });
});

describe("getCaptureMediaDurationFrames", () => {
  it("converts capture duration to usable scene frames after trimming", () => {
    expect(
      getCaptureMediaDurationFrames({
        durationMs: 21_880,
        startOffsetSeconds: 4,
        endOffsetSeconds: 0,
        fps: 60,
      }),
    ).toBe(1_073);
  });

  it("clamps to one frame when the trim fully consumes the capture", () => {
    expect(
      getCaptureMediaDurationFrames({
        durationMs: 500,
        startOffsetSeconds: 1,
        endOffsetSeconds: 0,
        fps: 60,
      }),
    ).toBe(1);
  });

  it("returns null when capture duration metadata is invalid", () => {
    expect(
      getCaptureMediaDurationFrames({
        durationMs: Number.NaN,
        startOffsetSeconds: 1,
        endOffsetSeconds: 0,
        fps: 60,
      }),
    ).toBeNull();
  });
});
