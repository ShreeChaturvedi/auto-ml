import React from "react";
import { OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import type { z } from "zod";
import { REGULAR_FONT } from "../../../config/fonts";
import type { demoScene } from "../../../config/scenes";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { AppChrome } from "../../helpers/AppChrome";
import { mainVideoPath } from "../../helpers/paths";
import { SceneVoiceover } from "../../helpers/SceneVoiceover";

type DemoSceneType = z.infer<typeof demoScene>;

type Props = {
  scene: DemoSceneType;
  theme: Theme;
};

/**
 * Demo scene: plays a screen recording inside a macOS-style app chrome
 * with gradient background. Open Recorder already bakes in cursor polish
 * and auto-zoom, so this wrapper only provides framing + optional overlays.
 */
export const Demo: React.FC<Props> = ({ scene, theme }) => {
  const { fps } = useVideoConfig();
  const startFrom =
    scene.startOffset > 0 ? Math.round(scene.startOffset * fps) : undefined;

  return (
    <AppChrome
      theme={theme}
      overlay={
        scene.chapter ? <ChapterBadge theme={theme} text={scene.chapter} /> : null
      }
    >
      <OffthreadVideo
        src={staticFile(mainVideoPath(scene.videoFile))}
        startFrom={startFrom}
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
      <SceneVoiceover file={scene.voiceoverFile} />
    </AppChrome>
  );
};

const ChapterBadge: React.FC<{ theme: Theme; text: string }> = ({ theme, text }) => {
  const c = COLORS[theme];
  return (
    <div
      style={{
        position: "absolute",
        top: 24,
        left: 24,
        ...REGULAR_FONT,
        fontSize: 20,
        color: c.WORD_COLOR_ON_BG_APPEARED,
        background: `${c.BACKGROUND}E6`,
        border: `1px solid ${c.BORDER_COLOR}`,
        borderRadius: 999,
        padding: "6px 14px",
        backdropFilter: "blur(12px)",
      }}
    >
      {text}
    </div>
  );
};
