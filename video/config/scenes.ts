import { z } from "zod";
import { brand, linkType, platform } from "./endcard";
import { canvasLayout } from "./layout";
import { theme } from "./themes";

/**
 * Scene schema for the capstone video composition.
 *
 * Every scene type is a variant in a Zod discriminated union keyed by `type`.
 * `remotion/scenes/Scene.tsx` is the dispatcher that maps each variant to its
 * component.
 *
 * ## Duration policy
 *
 * - If a scene declares `voiceoverFile`, its duration is derived from the
 *   MP3 length at build time (see remotion/calculate-metadata/calc-metadata.ts).
 * - Otherwise the scene's own `durationInFrames` (or a sensible default) is
 *   used. Defaults are expressed at 60fps.
 *
 * ## Adding a new scene type
 *
 * 1. Define a Zod object schema with a unique `type` literal.
 * 2. Add it to `selectableScenes`.
 * 3. Add a case in `Scene.tsx` that renders your component.
 */

// ---- Shared building blocks -------------------------------------------------

/** Voiceover file path, relative to `public/voiceover/main/`. */
const voiceoverFile = z.string().optional();

// ---- Slide (animated slide-agent content) ----------------------------------

/**
 * A slide rendered by a React component in `remotion/scenes/Slide/`.
 * The slide-agent fills in each slide body; `id` picks the component to render.
 */
export const slideScene = z.object({
  type: z.literal("slide"),
  /** Unique slide identifier — matches a case in `Slide/index.tsx`. */
  id: z.string(),
  voiceoverFile,
  /** Fallback duration when no voiceover — 6 seconds at 60 fps. */
  durationInFrames: z.number().int().positive().default(360),
  /** Optional free-form payload for slide body content. */
  meta: z.record(z.string(), z.unknown()).optional(),
});

// ---- Code reveal (shiki-magic-move morph) ----------------------------------

export const codeRevealScene = z.object({
  type: z.literal("codeReveal"),
  code: z.string(),
  language: z.enum(["ts", "tsx", "js", "jsx", "py", "sql", "bash", "json", "yaml", "md"]),
  /** Optional overlay title shown above the code. */
  title: z.string().optional(),
  /** Optional [start, end] line ranges (1-indexed, inclusive) to highlight. */
  highlight: z.array(z.tuple([z.number(), z.number()])).optional(),
  voiceoverFile,
  durationInFrames: z.number().int().positive().default(480),
});

// ---- App timeline (shared by `demoScene`) ----------------------------------

/** Reference to a VO alignment mark (resolved at runtime via useVoiceoverAlignment). */
const markRef = z.object({ mark: z.string() });
/** Reference that starts after another timeline event completes. */
const afterRef = z.object({ after: z.string(), offset: z.number().optional() });

/** Start-time discriminator for timeline events: absolute frame, mark, or after-ref. */
const eventStart = z.union([z.number(), markRef, afterRef]);

export const appTimelineEvent = z.object({
  id: z.string(),
  start: eventStart,
  kind: z.enum([
    "scrollTo",
    "cursorTo",
    "click",
    "type",
    "zoom",
    "toolCall",
    "llmToken",
    "assemble",
    "navigate",
    "sfx",
  ]),
  payload: z.record(z.string(), z.unknown()),
  /** Event duration (for events with an implicit end — e.g., zoom hold). */
  durationFrames: z.number().int().positive().optional(),
});

export type AppTimelineEvent = z.infer<typeof appTimelineEvent>;

/** Chrome variant wrapping the demo capture (mac window / browser / full-bleed). */
export const appChromeVariant = z.enum(["mac", "browser", "none"]);
export type AppChromeVariant = z.infer<typeof appChromeVariant>;

/**
 * Chrome-style tab strip entry for the `demoScene.tabs` field. Each tab may
 * optionally fade in at `appearFrame` — enabling the "a second tab just
 * opened" visual used by the signup→Gmail hand-off.
 */
export const chromeTab = z.object({
  title: z.string(),
  favicon: z.string().optional(),
  active: z.boolean(),
  appearFrame: z.number().int().nonnegative().optional(),
});

// ---- Demo (Playwright capture + Remotion overlay primitives) ----------------

export const demoScene = z.object({
  type: z.literal("demo"),
  /** Screen recording filename (no folder prefix). */
  videoFile: z.string(),
  /** Which `public/` subfolder the clip lives in. Legacy clips live in `main/`;
   * Playwright-driven captures live in `captures/`. */
  videoRoot: z.enum(["main", "captures"]).default("main"),
  voiceoverFile,
  /** Optional chapter label shown in the corner while the clip plays. */
  chapter: z.string().optional(),
  /**
   * Fallback duration in frames when no voiceover is present. If omitted
   * and no voiceover is provided, defaults to 8 seconds at 60 fps.
   */
  durationInFrames: z.number().int().positive().default(480),
  /** Trim the start of the video clip (in seconds). */
  startOffset: z.number().default(0),
  /** Trim the end of the video clip (in seconds). */
  endOffset: z.number().default(0),
  /** Chrome variant wrapping the capture. Defaults to macOS window. */
  chrome: appChromeVariant.default("mac"),
  /** URL shown in chrome="browser" variant's address bar. */
  url: z.string().optional(),
  /** Optional cursor path JSON, relative to `public/captures/`. */
  cursorFile: z.string().optional(),
  /** Horizontal anchoring for cover/contain media mapping. */
  mediaAlignX: z.enum(["left", "center", "right"]).optional(),
  /** Vertical anchoring for cover/contain media mapping. */
  mediaAlignY: z.enum(["top", "center", "bottom"]).optional(),
  /** Choreographed overlay events (VO-mark or chain-triggered). */
  timeline: z.array(appTimelineEvent).optional(),
  /**
   * Frame at which the chrome frame begins to dismiss (fade out while the
   * video wrapper transforms from chrome's inner-area rectangle to full-bleed).
   * Omit to keep the chrome visible for the full scene.
   */
  chromeDismissAt: z.number().int().nonnegative().optional(),
  /** Length of the chrome-dismiss tween. Consumers apply a 45 f default when
   * omitted — kept optional in the schema so existing demo scenes without
   * dismiss don't need to opt in with a field they don't use. */
  chromeDismissDurationFrames: z.number().int().positive().optional(),
  /**
   * Restore the chrome frame near the end of the scene, reversing the initial
   * full-bleed reveal back into browser framing. Used for landing→signup
   * continuity without clicking an in-page CTA.
   */
  chromeRestoreAtEnd: z.boolean().optional(),
  /** Length of the end-of-scene chrome-restore tween. */
  chromeRestoreDurationFrames: z.number().int().positive().optional(),
  /** How long to hold on the restored browser framing before cutting away. */
  chromeRestoreHoldFrames: z.number().int().nonnegative().optional(),
  /** Optional Chrome-style tab strip above the address bar. */
  tabs: z.array(chromeTab).optional(),
});

// ---- UrlIntro (Remotion-only new-tab → URL-typing scene) --------------------

/**
 * Pure-Remotion scene that opens on a painterly new-tab backdrop, zooms into
 * the URL pill, and animates a URL being typed. Hard-cuts into the landing
 * demo scene — the chrome continues unchanged so the transition is invisible.
 */
export const urlIntroScene = z.object({
  type: z.literal("urlIntro"),
  /** URL to type into the address bar (e.g. "agentic-automl.vercel.app"). */
  url: z.string(),
  /** Painterly backdrop asset path, relative to `public/` (e.g. "backgrounds/newtab-bg.webp"). */
  backgroundAsset: z.string().optional(),
  voiceoverFile,
  /** Default 270 f — 4.5 s @ 60 fps. */
  durationInFrames: z.number().int().positive().default(270),
});

// ---- Title card -------------------------------------------------------------

export const titleScene = z.object({
  type: z.literal("title"),
  title: z.string(),
  subtitle: z.string().nullable().default(null),
  voiceoverFile,
  durationInFrames: z.number().int().positive().default(180),
});

// ---- End card ---------------------------------------------------------------

export const endcardScene = z.object({
  type: z.literal("endcard"),
  durationInFrames: z.number().int().positive().default(360),
  channel: brand,
  links: z.array(linkType).default([]),
});

// ---- Table of contents ------------------------------------------------------

export const tableOfContentsScene = z.object({
  type: z.literal("tableofcontents"),
  durationInFrames: z.number().int().positive().default(240),
});

// ---- Union ------------------------------------------------------------------

export const selectableScenes = z.discriminatedUnion("type", [
  slideScene,
  codeRevealScene,
  demoScene,
  urlIntroScene,
  titleScene,
  endcardScene,
  tableOfContentsScene,
]);

export type SelectableScene = z.infer<typeof selectableScenes>;

// ---- Composition schema -----------------------------------------------------

export const videoConf = z.object({
  theme,
  canvasLayout,
  platform,
  scenes: z.array(selectableScenes),
});

export type VideoConf = z.infer<typeof videoConf>;

// ---- Metadata (computed by calc-metadata) -----------------------------------

/** Alignment block sidecar from ElevenLabs /with-timestamps — optional. */
export type SceneAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type SceneWithMetadata = {
  scene: SelectableScene;
  from: number;
  durationInFrames: number;
  chapter: string | null;
  /** Source media dimensions from `public/captures/*.meta.json` when available. */
  captureSize?: {
    width: number;
    height: number;
  };
  /** Populated only when scene has a voiceoverFile and its sidecar .alignment.json exists. */
  alignment?: SceneAlignment;
};

export type ChapterMark = {
  index: number;
  title: string;
  start: number;
};
