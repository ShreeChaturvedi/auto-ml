import type { ComponentType } from "react";
import type { AppScene, AppScreenId, SceneWithMetadata } from "../../../config/scenes";
import { LandingScreen } from "./screens/LandingScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { SignupScreen } from "./screens/SignupScreen";
import { HomeScreen } from "./screens/HomeScreen";

export type AppScreenProps = {
  scene: AppScene;
  meta: SceneWithMetadata;
};

export type AppScreenComponent = ComponentType<AppScreenProps>;

/**
 * Screen registry. Each entry is a concrete screen component imported
 * synchronously.
 *
 * We previously used `React.lazy(() => import(...))` here, paired with a
 * `<Suspense fallback>` in `AppScene/index.tsx` that called
 * `continueRender(handle)` on a 100ms setTimeout. That arrangement lied to
 * Remotion: the fallback signalled "frame ready" before the lazy import
 * had necessarily resolved, so the captured frame sometimes painted the
 * blank white fallback instead of the screen. These screen modules are
 * small enough that lazy-splitting offers no real payoff, and the
 * deterministic synchronous path is strictly better for Remotion renders.
 *
 * Empty registry == AppScene renders the missing-screen placeholder
 * pointing at the unregistered screen id.
 */

export const screenRegistry: Partial<Record<AppScreenId, AppScreenComponent>> = {
  landing: LandingScreen,
  login: LoginScreen,
  signup: SignupScreen,
  home: HomeScreen,
};
