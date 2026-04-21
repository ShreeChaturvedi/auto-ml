import type { z } from "zod";
import { SLIDE_SCENES } from "../config/default-scenes";
import { slideScene } from "../config/scenes";

type SlideSceneType = z.infer<typeof slideScene>;

/**
 * Presenter-mode manifest.
 *
 * Imports only `SLIDE_SCENES` (not `DEFAULT_SCENES`) so Vite can tree-shake
 * the demo-scene array entirely — demo string literals like `"signup.webm"`
 * and `"newtab-bg.webp"` never reach browser JS. Strips the `closing`
 * slide, removes every `voiceoverFile` so `SceneVoiceover` renders null,
 * then appends a new `thank-you` terminal card.
 *
 * Typed narrowly as `readonly SlideSceneType[]` + frozen at runtime so a
 * teammate adding a demo entry to this list fails to compile (structural
 * guarantee that demo code never leaks into the presenter bundle).
 */

/** Slides dropped from the presenter manifest (kept in `SLIDE_SCENES` so
 *  the MP4 build still renders them). */
const EXCLUDED_SLIDE_IDS = new Set<string>(["closing"]);

/** Strip `voiceoverFile` so `SceneVoiceover` renders null — presenter mode
 *  plays every slide silent (the user narrates live). */
const stripVO = (s: SlideSceneType): SlideSceneType => {
  const copy: SlideSceneType = { ...s };
  delete copy.voiceoverFile;
  return copy;
};

const presenterSlides: SlideSceneType[] = SLIDE_SCENES.filter(
  (s) => !EXCLUDED_SLIDE_IDS.has(s.id),
).map(stripVO);

export const PRESENTATION_SCENES: readonly SlideSceneType[] = Object.freeze([
  ...presenterSlides,
  { type: "slide" as const, id: "thank-you", durationInFrames: 420 },
]);

/**
 * Slides that play the FULL Remotion animation from frame 0 with autoPlay,
 * rather than the default "land on settled frame, play 200ms fade-in only"
 * treatment. Reserved for the dramatic bookends of the deck — the rest of
 * the presentation is slide-paced narration, not video-chunk playback.
 */
export const FULL_ANIMATION_IDS: ReadonlySet<string> = new Set([
  "title",
  "thank-you",
]);

/**
 * Per-slide override for the "settled frame" the presenter lands on when
 * navigating to the slide. Defaults to `durationInFrames - 1`.
 *
 * Listed only for slides where the final frame is NOT the right resting
 * composition — e.g., `hook` draws its flourish IN, holds it, then draws
 * it OUT at ~frame 555 of 720. Landing at frame 719 would show the slide
 * without its flourish. Settle at frame 470 instead, where the flourish
 * is held in its finished state and all other entry animations have
 * completed.
 */
export const SLIDE_SETTLE_FRAMES: Readonly<Record<string, number>> =
  Object.freeze({
    // `hook` draws its flourish IN, holds it, then draws OUT at ~frame 555
    // of 720. Settle at 470 so the flourish is in its held state.
    hook: 470,
    // `arch-pullback` spends its final 420 frames fading the entire
    // composition to black (phase 11 of the 12-phase timeline). Landing
    // at 2759 shows only the footer brand bug. Frame 2339 = end of
    // phase 10 (final telemetry pill locked in), just before fade.
    "arch-pullback": 2339,
  });

/** Resolve the settled-frame landing for a given slide scene. */
export const settleFrameFor = (scene: SlideSceneType): number => {
  const override = SLIDE_SETTLE_FRAMES[scene.id];
  if (typeof override === "number") {
    return Math.max(0, Math.min(override, scene.durationInFrames - 1));
  }
  return Math.max(0, scene.durationInFrames - 1);
};
