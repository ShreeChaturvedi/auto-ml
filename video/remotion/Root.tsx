import React from "react";
import { Composition } from "remotion";
import { DEFAULT_SCENES } from "../config/default-scenes";
import { FPS } from "../config/fps";
import { DIMENSIONS } from "../config/layout";
import type { SelectableScene } from "../config/scenes";
import { videoConf } from "../config/scenes";
import { DEFAULT_THEME } from "../config/themes";
import { Main } from "./Main";
import { calcMetadata } from "./calculate-metadata/calc-metadata";

// DEFAULT_SCENES + DEFAULT_CHAPTERS moved to ../config/default-scenes.ts so
// the presenter-mode web app can import the same source of truth. See
// `video/presentation/slides.ts` for the derived presenter manifest.

// Isolated arch-section preview — 8 scenes only, frame 0 starts at arch-hook.
// Used to render per-scene still frames during visual QA without compiling
// the full 15k-frame lead-up. Safe to leave registered; does not affect
// `npm run build` which targets `main`.
const ARCH_PREVIEW_SCENES: SelectableScene[] = DEFAULT_SCENES.filter(
  (s) => s.type === "slide" && s.id.startsWith("arch-"),
);

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
      <Composition
        id="arch-preview"
        component={Main}
        schema={videoConf}
        width={DIMENSIONS.landscape.width}
        height={DIMENSIONS.landscape.height}
        fps={FPS}
        durationInFrames={600}
        defaultProps={{
          theme: DEFAULT_THEME,
          canvasLayout: "landscape" as const,
          platform: "youtube" as const,
          scenes: ARCH_PREVIEW_SCENES,
          scenesAndMetadata: [],
          chapters: [],
        }}
        calculateMetadata={calcMetadata}
      />
    </>
  );
};
