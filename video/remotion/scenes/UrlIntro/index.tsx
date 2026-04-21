import React from "react";
import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { urlIntroScene } from "../../../config/scenes";
import type { Theme } from "../../../config/themes";
import { getChromeGradient } from "../../../config/themes";
import { BrowserChrome } from "../../helpers/BrowserChrome";
import { SceneVoiceover } from "../../helpers/SceneVoiceover";
import { AddressBarTyper } from "../../primitives/AddressBarTyper";
import { ZoomFrame } from "../../primitives/ZoomFrame";
import { NewTabBackdrop } from "./NewTabBackdrop";

type UrlIntroSceneType = z.infer<typeof urlIntroScene>;

type Props = {
  scene: UrlIntroSceneType;
  theme: Theme;
};

/**
 * URL-typing intro scene — the first beat of the browser narrative.
 *
 * Timeline (330 f @ 60 fps = 5.5 s):
 *   f=0-75    hold on empty new-tab backdrop (1250 ms breathing room)
 *   f=75-105  zoom IN over 30 f (500 ms) at scale 2.8×
 *   f=105-120 settle at zoomed state (15 f)
 *   f=120-195 URL typing at rate=3 → 25 chars × 3 = 75 f
 *   f=195-210 commit flash (15 f): caret hides, subtle scale pop
 *   f=210-240 zoom OUT over 30 f
 *   f=240-330 tail hold with full URL visible (~1500 ms before hard-cut)
 *
 * The landing scene immediately after should render `chrome: "browser"` with
 * the same URL in the address bar — pixel-continuity makes the scene change
 * invisible to the viewer. The chrome then dismisses over ~45 f once the
 * landing drive starts.
 */
export const UrlIntro: React.FC<Props> = ({ scene, theme }) => {
  const url = scene.url;
  const urlLen = url.length;
  const rate = 3;

  const holdFrames = 75;
  const zoomAt = holdFrames;
  const zoomDurationFrames = 30;
  const settleFrames = 15;
  const typeStartFrame = zoomAt + zoomDurationFrames + settleFrames; // 120
  const typeEndFrame = typeStartFrame + urlLen * rate; // 195
  const commitFrame = typeEndFrame + settleFrames; // 210
  const commitDurationFrames = settleFrames; // 15
  const zoomReleaseAt = commitFrame + commitDurationFrames; // 225 — release after commit completes

  // URL pill center in composition-space (1920×1080 canvas). Matches the real
  // position of the pill rendered by `BrowserChrome` with `titleBar` at y=96
  // (padding top) + centered horizontally with ~720 px max width.
  const zoomRegion = { x: 600, y: 96, w: 720, h: 40 };

  return (
    <AbsoluteFill>
      <ZoomFrame
        at={zoomAt}
        release={zoomReleaseAt}
        region={zoomRegion}
        scale={2.8}
        durationFrames={zoomDurationFrames}
      >
        <BrowserChrome
          variant="browser"
          outerBackground={getChromeGradient(theme)}
          urlChildren={
            <AddressBarTyper
              url={url}
              startFrame={typeStartFrame}
              rate={rate}
              commitFrame={commitFrame}
              commitDurationFrames={commitDurationFrames}
            />
          }
        >
          <NewTabBackdrop backgroundAsset={scene.backgroundAsset} />
        </BrowserChrome>
      </ZoomFrame>
      <SceneVoiceover file={scene.voiceoverFile} />
    </AbsoluteFill>
  );
};
