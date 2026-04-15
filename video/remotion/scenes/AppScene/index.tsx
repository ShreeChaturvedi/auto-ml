import "../../../src/frontend-bridge/determinism";
import React, { Suspense } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import type {
  AppScene as AppSceneData,
  SceneWithMetadata,
} from "../../../config/scenes";
import { AppSceneChrome } from "./AppSceneChrome";
import { screenRegistry } from "./screenRegistry";

export type AppSceneProps = {
  scene: AppSceneData;
  meta: SceneWithMetadata;
};

/**
 * AppScene — the orchestrator that mounts a real-app screen component inside
 * a `BrowserChrome` variant and threads voiceover-aligned timeline events to
 * the primitives.
 *
 * Flow:
 *   1. Resolve the screen component from `screenRegistry[scene.screen]`. If
 *      the screen isn't registered yet (Beat hasn't landed), render a
 *      diagnostic placeholder pointing at the missing screen id instead of
 *      crashing — this lets the rest of the composition render while Beats
 *      1/2/3+ fill the registry.
 *   2. Wrap the screen in `AppSceneChrome`, which dispatches to the right
 *      `BrowserChrome` variant (`mac` / `browser` / `none`) and forwards
 *      `scene.url` to the address bar.
 *   3. Wrap the screen in a `<Suspense>` boundary — registry entries are
 *      lazy-loaded via `React.lazy`, and Suspense+`delayRender`+`continueRender`
 *      keeps the render deterministic (the frame is held until the screen's
 *      module has resolved).
 *
 * The top-level determinism import is defensive: `Root.tsx` also imports it,
 * but it's idempotent and guarantees the Math.random / Date / matchMedia
 * patches are in effect before any real frontend component mounts.
 */
export const AppScene: React.FC<AppSceneProps> = ({ scene, meta }) => {
  const ScreenComponent = screenRegistry[scene.screen];

  if (!ScreenComponent) {
    return <MissingScreenPlaceholder screenId={scene.screen} />;
  }

  return (
    <AppSceneChrome scene={scene}>
      <Suspense fallback={<LazyFallback />}>
        <ScreenComponent scene={scene} meta={meta} />
      </Suspense>
    </AppSceneChrome>
  );
};

/**
 * Rendered while `React.lazy` resolves the screen module. Holds the Remotion
 * render via `delayRender` so the frame we ultimately capture shows the real
 * screen, not the blank fallback. The 100ms ceiling is defensive — webpack
 * resolves lazy chunks synchronously during SSR in Remotion, so in practice
 * the fallback never actually paints.
 */
const LazyFallback: React.FC = () => {
  const [handle] = React.useState(() => delayRender("Lazy-load AppScene screen"));
  React.useEffect(() => {
    const t = setTimeout(() => continueRender(handle), 100);
    return () => clearTimeout(t);
  }, [handle]);
  return <AbsoluteFill style={{ background: "#ffffff" }} />;
};

/**
 * Diagnostic full-bleed card shown when `scene.screen` has no registered
 * component. Renders deterministic text so a missed registry entry is
 * obvious in studio + review, without breaking the rest of the composition.
 */
const MissingScreenPlaceholder: React.FC<{ screenId: string }> = ({ screenId }) => (
  <AbsoluteFill
    style={{
      background: "#0A0A0B",
      color: "#E6E6E6",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
      fontSize: 24,
      padding: 48,
      textAlign: "center",
    }}
  >
    <div>
      <div
        style={{
          fontSize: 14,
          opacity: 0.6,
          marginBottom: 12,
          letterSpacing: 0.5,
        }}
      >
        AppScene — screen not registered
      </div>
      <div style={{ fontFamily: "monospace" }}>{screenId}</div>
    </div>
  </AbsoluteFill>
);
