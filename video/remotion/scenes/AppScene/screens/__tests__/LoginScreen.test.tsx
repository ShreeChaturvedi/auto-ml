/**
 * LoginScreen smoke test: the real LoginForm must mount under the
 * frontend-bridge shims (mock auth API + auth store) without throwing.
 *
 * If this fails, fix the shim surface — don't silence it.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      fps: 60,
      width: 1920,
      height: 1080,
      durationInFrames: 240,
    }),
  };
});

import { LoginScreen } from "../LoginScreen";
import type { AppScreenProps } from "../../screenRegistry";

// Minimal scene/meta: useTimelineRunner reads `scene.timeline` (defaults to
// []) and `meta.alignment` (undefined → mark refs warn once and resolve to 0).
const minimalProps = {
  scene: { type: "app", screen: "login", chrome: "browser", timeline: [], durationInFrames: 600 },
  meta: { scene: { type: "app" }, from: 0, durationInFrames: 600, chapter: null },
} as unknown as AppScreenProps;

describe("LoginScreen", () => {
  it("mounts the real LoginForm under shims without throwing", () => {
    expect(() => {
      const html = renderToStaticMarkup(<LoginScreen {...minimalProps} />);
      expect(html).toBeTruthy();
    }).not.toThrow();
  });

  it("renders the LoginForm header + key form elements", () => {
    const html = renderToStaticMarkup(<LoginScreen {...minimalProps} />);
    // Title from the real LoginForm.
    expect(html).toContain("Welcome Back");
    // Email + password input registrations (react-hook-form puts `name=...`).
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    // Sign-up footer link surfaces the navigation target for Beat 2.
    expect(html).toContain("Sign up");
    expect(html).toContain("/signup");
  });
});
