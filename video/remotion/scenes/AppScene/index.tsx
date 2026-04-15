import React from "react";
import { AbsoluteFill } from "remotion";
import type { AppScene as AppSceneData, SceneWithMetadata } from "../../../config/scenes";

/**
 * Placeholder AppScene — the real implementation mounts actual frontend
 * components (Landing, Login, Signup, Home, project phases) inside a chrome
 * variant (mac / browser / none) and drives choreography via the `timeline`
 * events resolved against VO alignment marks.
 *
 * Follow-up tasks replace this debug div with:
 *  1. Chrome dispatch via `BrowserChrome` (mac/browser/none).
 *  2. Screen renderer dispatch via `AppScene/screens/<screenId>`.
 *  3. Timeline runner that resolves `{ mark }` / `{ after }` refs via
 *     `useVoiceoverAlignment` + cascade.
 */
export const AppScene: React.FC<{ scene: AppSceneData; meta: SceneWithMetadata }> = ({
  scene,
}) => {
  return (
    <AbsoluteFill style={{ background: "#0A0A0B", color: "white", padding: 48 }}>
      <div>
        AppScene placeholder — screen={scene.screen}, chrome={scene.chrome}
      </div>
    </AbsoluteFill>
  );
};
