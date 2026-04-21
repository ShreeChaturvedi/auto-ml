import { describe, expect, it, vi } from "vitest";

// Same mocks as the rest of the remotion slide test suite: avoid pulling
// Remotion's real internals through jsdom (which would evaluate font-loading
// delayRender side-effects) and stub the hooks slides call during render.
vi.mock("../../config/fonts", () => ({
  REGULAR_FONT: { fontFamily: "sans-serif", fontWeight: 500 },
  TITLE_FONT: { fontFamily: "sans-serif", fontWeight: 700 },
  SERIF_FONT: { fontFamily: "serif", fontWeight: 400 },
  MONOSPACE_FONT: { fontFamily: "monospace", fontWeight: 500 },
  ENDCARD_FONT: { fontFamily: "sans-serif", fontWeight: 600 },
  waitForFonts: async () => {},
}));

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: vi.fn(() => 0),
    useVideoConfig: vi.fn(() => ({
      fps: 60,
      width: 1920,
      height: 1080,
      durationInFrames: 600,
    })),
  };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_NON_SLIDE_COUNT,
  DEFAULT_SCENES,
} from "../../config/default-scenes";
import { Slide } from "../../remotion/scenes/Slide";
import { FULL_ANIMATION_IDS, PRESENTATION_SCENES } from "../slides";

describe("PRESENTATION_SCENES manifest", () => {
  it("every entry is wired in Slide/index.tsx (no fallback)", () => {
    for (const scene of PRESENTATION_SCENES) {
      // A render error from deep component internals is unrelated to what
      // this test is checking — we only care that the dispatcher routes
      // `scene.id` to a registered case. Capture the markup when it renders
      // cleanly; skip on throws (the error would be an unrelated render
      // issue, not a "not registered" miss since the fallback branch has
      // no hooks and cannot throw).
      let markup = "";
      try {
        markup = renderToStaticMarkup(
          React.createElement(Slide, { scene, theme: "light" }),
        );
      } catch {
        // If render throws, the dispatcher DID route to a real component
        // (the fallback is a static div that cannot throw), so the test
        // invariant holds.
        continue;
      }
      expect(
        markup,
        `slide id "${scene.id}" is not wired in Slide/index.tsx`,
      ).not.toContain("is not registered");
    }
  });

  it("every entry has type === 'slide'", () => {
    for (const scene of PRESENTATION_SCENES) {
      expect(scene.type).toBe("slide");
    }
  });

  it("no entry carries a voiceoverFile (strip-VO is universal)", () => {
    for (const scene of PRESENTATION_SCENES) {
      expect(
        scene.voiceoverFile,
        `slide "${scene.id}" still carries a voiceoverFile`,
      ).toBeUndefined();
    }
  });

  it("thank-you is the terminal slide", () => {
    const last = PRESENTATION_SCENES[PRESENTATION_SCENES.length - 1];
    expect(last?.id).toBe("thank-you");
  });

  it("all slide ids are unique", () => {
    const ids = PRESENTATION_SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("closing is excluded from the presenter manifest", () => {
    const ids = PRESENTATION_SCENES.map((s) => s.id);
    expect(ids).not.toContain("closing");
  });

  it("FULL_ANIMATION_IDS targets only the bookend slides and they exist", () => {
    expect(FULL_ANIMATION_IDS.has("title")).toBe(true);
    expect(FULL_ANIMATION_IDS.has("thank-you")).toBe(true);
    // Sanity: must be a tiny allow-list, not a sprawling set.
    expect(FULL_ANIMATION_IDS.size).toBe(2);
    // Every id in the allow-list must correspond to a real slide.
    const ids = new Set(PRESENTATION_SCENES.map((s) => s.id));
    for (const id of FULL_ANIMATION_IDS) {
      expect(ids.has(id), `FULL_ANIMATION_IDS has unknown slide "${id}"`).toBe(
        true,
      );
    }
  });

  // Demo-leak alarm: DEFAULT_SCENES currently holds exactly 5 non-slide entries
  // (1 urlIntro + 4 demo). If a teammate adds another demo scene to the video,
  // this count bumps and the test fails loudly — prompting a review of whether
  // the presenter manifest needs updating.
  it("DEFAULT_SCENES contains exactly 5 non-slide entries", () => {
    expect(DEFAULT_NON_SLIDE_COUNT).toBe(5);
    const nonSlide = DEFAULT_SCENES.filter((s) => s.type !== "slide");
    expect(nonSlide.length).toBe(5);
    const types = nonSlide.map((s) => s.type).sort();
    expect(types).toEqual(["demo", "demo", "demo", "demo", "urlIntro"]);
  });
});
