import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { CanvasLayout } from "../config/layout";
import type { Platform } from "../config/endcard";
import type {
  ChapterMark,
  SceneWithMetadata,
  SelectableScene,
} from "../config/scenes";
import type { Theme } from "../config/themes";
import { COLORS } from "../config/themes";
import { WaitForFonts } from "./helpers/WaitForFonts";
import { Scene } from "./scenes/Scene";

export type MainProps = {
  canvasLayout: CanvasLayout;
  platform: Platform;
  theme: Theme;
  /** Authored scene list; source of truth for `calculate-metadata`. */
  scenes: SelectableScene[];
  /** Populated by `calculate-metadata` — from/durationInFrames for each scene. */
  scenesAndMetadata: SceneWithMetadata[];
  /** Populated by `calculate-metadata` — chapter marks for ToC/progress UI. */
  chapters: ChapterMark[];
};

export const Main: React.FC<MainProps> = ({
  scenesAndMetadata,
  theme,
  chapters,
}) => {
  if (scenesAndMetadata.length === 0) {
    return (
      <AbsoluteFill
        style={{
          background: COLORS[theme].BACKGROUND,
          alignItems: "center",
          justifyContent: "center",
          color: COLORS[theme].WORD_COLOR_ON_BG_APPEARED,
          fontSize: 32,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Add scenes to Root.tsx defaultProps to see something here.
      </AbsoluteFill>
    );
  }

  return (
    <WaitForFonts>
      <AbsoluteFill style={{ background: COLORS[theme].BACKGROUND }}>
        {scenesAndMetadata.map((sceneAndMetadata, index) => (
          <Sequence
            key={`${sceneAndMetadata.scene.type}:${index}:${sceneAndMetadata.from}`}
            name={`${sceneAndMetadata.scene.type}:${index}`}
            from={sceneAndMetadata.from}
            durationInFrames={Math.max(1, sceneAndMetadata.durationInFrames)}
          >
            <Scene
              sceneAndMetadata={sceneAndMetadata}
              theme={theme}
              chapters={chapters}
            />
          </Sequence>
        ))}
      </AbsoluteFill>
    </WaitForFonts>
  );
};
