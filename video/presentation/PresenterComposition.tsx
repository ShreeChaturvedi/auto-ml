import React from "react";
import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { slideScene } from "../config/scenes";
import { COLORS, type Theme } from "../config/themes";
import { WaitForFonts } from "../remotion/helpers/WaitForFonts";
import { Slide } from "../remotion/scenes/Slide";

type SlideSceneType = z.infer<typeof slideScene>;

export type PresenterProps = {
  scene: SlideSceneType;
  theme: Theme;
};

/**
 * Player-mounted presenter composition. One slide per render.
 *
 * Imports the `Slide` dispatcher directly (NOT `Scene`) so Demo / UrlIntro /
 * EndCard / TableOfContents / CodeReveal / Title code is never pulled into
 * the presenter bundle via static imports.
 *
 * `WaitForFonts` holds the first paint until Plus Jakarta Sans + Instrument
 * Serif load — subsequent remounts are instant because the browser caches
 * both. `SceneVoiceover` (rendered inside `Slide`) returns null because
 * `slides.ts` strips `voiceoverFile` from every manifest entry.
 */
export const PresenterComposition: React.FC<PresenterProps> = ({
  scene,
  theme,
}) => (
  <WaitForFonts>
    <AbsoluteFill style={{ background: COLORS[theme].BACKGROUND }}>
      <Slide scene={scene} theme={theme} />
    </AbsoluteFill>
  </WaitForFonts>
);
