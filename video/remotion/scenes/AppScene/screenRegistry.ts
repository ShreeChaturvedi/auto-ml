import { lazy, type ComponentType } from "react";
import type { AppScene, AppScreenId, SceneWithMetadata } from "../../../config/scenes";

export type AppScreenProps = {
  scene: AppScene;
  meta: SceneWithMetadata;
};

export type AppScreenComponent = ComponentType<AppScreenProps>;

/**
 * Screen registry. Each entry is a lazy-loaded screen component so we don't
 * bundle all real-app components into every scene. `React.lazy` is used with
 * Remotion's `<delayRender>` handle via `<Suspense>` in `AppScene/index.tsx`
 * so renders stay deterministic — the lazy fallback delays the frame until
 * the screen module has loaded.
 *
 * Screens are added as Beats 1/2/3+ land. Empty registry == AppScene renders
 * an empty-state placeholder pointing at the missing screen id.
 */

export const screenRegistry: Partial<Record<AppScreenId, AppScreenComponent>> = {
  // Populated by Beat 1/2/3+ tasks via `lazy()` imports.
  landing: lazy(() =>
    import("./screens/LandingScreen").then((m) => ({ default: m.LandingScreen })),
  ),
  login: lazy(() =>
    import("./screens/LoginScreen").then((m) => ({ default: m.LoginScreen })),
  ),
  signup: lazy(() =>
    import("./screens/SignupScreen").then((m) => ({ default: m.SignupScreen })),
  ),
  home: lazy(() =>
    import("./screens/HomeScreen").then((m) => ({ default: m.HomeScreen })),
  ),
};
