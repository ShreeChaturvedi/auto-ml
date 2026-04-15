import React from "react";
import { Composition } from "remotion";
import { FPS } from "../config/fps";
import { DIMENSIONS } from "../config/layout";
import type { SelectableScene } from "../config/scenes";
import { videoConf } from "../config/scenes";
import { DEFAULT_THEME } from "../config/themes";
import { Main } from "./Main";
import { calcMetadata } from "./calculate-metadata/calc-metadata";

/**
 * Default chapter list for `AgendaSlide`. Read from `scene.meta.chapters` —
 * the slide parses them at runtime with a type-guard so a malformed payload
 * falls back to its own internal copy.
 *
 * `as const` preserves literal types + `readonly` — `meta` is typed as
 * `Record<string, unknown>` so the payload is widened at the boundary.
 */
const DEFAULT_CHAPTERS = [
  { title: "Upload & Project Planning", timestamp: "02:05" },
  { title: "Data Exploration — EDA + Natural-Language SQL", timestamp: "04:40" },
  {
    title: "Preprocessing — the LangGraph finite state machine",
    timestamp: "08:10",
    accent: true,
  },
  { title: "Feature Engineering", timestamp: "12:05" },
  { title: "Training — sandboxed Docker notebooks", timestamp: "14:20" },
  { title: "Experiments & Leaderboard", timestamp: "17:05" },
  { title: "What's Next", timestamp: "19:40" },
] as const;

/**
 * Initial scene list.
 *
 * This is intentionally tiny. Slide-agent and demo-capture will expand it
 * over time. The order here is the order scenes play in the final video.
 *
 * To preview a single scene in the Studio, you can use the sidebar to
 * scrub to the relevant time range. If you need an isolated composition
 * for iterating on a single scene, add a new `<Composition>` below
 * with a 1-item `scenes` array.
 */
const DEFAULT_SCENES: SelectableScene[] = [
  { type: "slide", id: "title", durationInFrames: 540 },
  { type: "slide", id: "hook", durationInFrames: 720 },
  { type: "slide", id: "team", durationInFrames: 840 },
  { type: "slide", id: "acknowledgements", durationInFrames: 780 },
  { type: "slide", id: "problem-trio", durationInFrames: 2040 },
  { type: "slide", id: "why-now", durationInFrames: 1440 },
  {
    type: "slide",
    id: "agenda",
    durationInFrames: 1620,
    meta: { chapters: DEFAULT_CHAPTERS },
  },
];

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="main"
      component={Main}
      schema={videoConf}
      // initial fallbacks — `calculateMetadata` overrides them from scene data.
      width={DIMENSIONS.landscape.width}
      height={DIMENSIONS.landscape.height}
      fps={FPS}
      durationInFrames={600}
      defaultProps={{
        theme: DEFAULT_THEME,
        canvasLayout: "landscape" as const,
        platform: "youtube" as const,
        scenes: DEFAULT_SCENES,
        scenesAndMetadata: [],
        chapters: [],
      }}
      calculateMetadata={calcMetadata}
    />
  );
};
