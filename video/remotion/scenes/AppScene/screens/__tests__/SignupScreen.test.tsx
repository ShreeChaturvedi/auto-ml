/**
 * SignupScreen smoke test: the real SignupForm must mount under the
 * frontend-bridge shims and expose all four registered inputs that
 * `useTypeIntoInput` hooks target.
 *
 * Note: SSR can't run the `useTypeIntoInput` effects (no document), so we
 * only assert the static markup contains the input registrations + form
 * surface. End-to-end typing is exercised under Remotion at render time.
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

import { SignupScreen } from "../SignupScreen";
import type { AppScreenProps } from "../../screenRegistry";

const minimalProps = {
  scene: { type: "app", screen: "signup", chrome: "browser", timeline: [], durationInFrames: 840 },
  meta: { scene: { type: "app" }, from: 0, durationInFrames: 840, chapter: null },
} as unknown as AppScreenProps;

describe("SignupScreen", () => {
  it("mounts the real SignupForm under shims without throwing", () => {
    expect(() => {
      const html = renderToStaticMarkup(<SignupScreen {...minimalProps} />);
      expect(html).toBeTruthy();
    }).not.toThrow();
  });

  it("renders the SignupForm header + all four registered fields", () => {
    const html = renderToStaticMarkup(<SignupScreen {...minimalProps} />);
    // Header from real SignupForm.
    expect(html).toContain("Create an Account");
    // All four react-hook-form-registered inputs that useTypeIntoInput targets.
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('name="confirmPassword"');
    // Footer link back to login.
    expect(html).toContain("Sign in");
    expect(html).toContain("/login");
  });
});
