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
  // TEMP — primitives smoke test. Removed in Commit 10 (dispatcher integration).
  { type: "slide", id: "sandbox", durationInFrames: 360 },
  { type: "slide", id: "intro", durationInFrames: 360 },
  { type: "slide", id: "team", durationInFrames: 360 },
  { type: "slide", id: "problem", durationInFrames: 360 },
  { type: "tableofcontents", durationInFrames: 240 },
  { type: "endcard", durationInFrames: 360, channel: "capstone", links: [] },
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
