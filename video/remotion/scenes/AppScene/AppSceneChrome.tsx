import React from "react";
import type { ReactNode } from "react";
import { BrowserChrome } from "../../helpers/BrowserChrome";
import type { AppScene } from "../../../config/scenes";

export type AppSceneChromeProps = {
  scene: AppScene;
  /** Frame-resolved URL override (for animated URL transitions via `navigate` events). */
  currentUrl?: string;
  children: ReactNode;
};

/**
 * Thin wrapper around `BrowserChrome` that picks the right variant from the
 * scene's `chrome` field and threads an animated URL (when a `navigate`
 * timeline event is active) through to the address bar.
 *
 * The scene's own `url` is the "at-rest" URL; `currentUrl` overrides it on a
 * per-frame basis during URL transitions.
 */
export const AppSceneChrome: React.FC<AppSceneChromeProps> = ({
  scene,
  currentUrl,
  children,
}) => {
  return (
    <BrowserChrome variant={scene.chrome} url={currentUrl ?? scene.url}>
      {children}
    </BrowserChrome>
  );
};
