import "../../../src/frontend-bridge/determinism";
import React from "react";
import { AbsoluteFill } from "remotion";
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
 *
 * Screen modules are imported synchronously (see `screenRegistry.ts`) so
 * Remotion always captures real content on the first frame — no Suspense,
 * no lazy-load flicker, no `delayRender` race with `continueRender`.
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
      <ScreenComponent scene={scene} meta={meta} />
    </AppSceneChrome>
  );
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
