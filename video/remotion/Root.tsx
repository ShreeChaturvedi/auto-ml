import React from "react";
import { Composition } from "remotion";
import { FPS } from "../config/fps";
import { DIMENSIONS } from "../config/layout";
import { videoConf } from "../config/scenes";
import {
  DEFAULT_SCENES,
  DESKTOP_DEMO_SCENES,
  DESKTOP_DEMO_TOTAL_FRAMES,
} from "../config/scene-assembly";
import { DEFAULT_THEME } from "../config/themes";
import { Main } from "./Main";
import { calcMetadata } from "./calculate-metadata/calc-metadata";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="main"
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
          scenes: DEFAULT_SCENES,
          scenesAndMetadata: [],
          chapters: [],
        }}
        calculateMetadata={calcMetadata}
      />
      <Composition
        id="desktop-demos"
        component={Main}
        schema={videoConf}
        width={DIMENSIONS.landscape.width}
        height={DIMENSIONS.landscape.height}
        fps={FPS}
        durationInFrames={DESKTOP_DEMO_TOTAL_FRAMES}
        defaultProps={{
          theme: DEFAULT_THEME,
          canvasLayout: "landscape" as const,
          platform: "youtube" as const,
          scenes: DESKTOP_DEMO_SCENES,
          scenesAndMetadata: [],
          chapters: [],
        }}
        calculateMetadata={calcMetadata}
      />
    </>
  );
};
