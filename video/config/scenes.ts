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

// ---- Demo (screen recording inside app chrome) ------------------------------

export const demoScene = z.object({
  type: z.literal("demo"),
  /** Screen recording path, relative to `public/main/`. */
  videoFile: z.string(),
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

export type SceneWithMetadata = {
  scene: SelectableScene;
  from: number;
  durationInFrames: number;
  chapter: string | null;
};

export type ChapterMark = {
  index: number;
  title: string;
  start: number;
};
