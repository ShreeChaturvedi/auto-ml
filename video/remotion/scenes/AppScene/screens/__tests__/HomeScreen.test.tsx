/**
 * HomeScreen smoke test: the real HomePage component must mount under the
 * frontend-bridge shims without throwing. We don't assert pixel output here
 * (that's for visual review) — just that the render tree resolves without
 * missing modules, throwing on undefined state, or crashing in effects.
 *
 * If this test fails, fix the shim surface; don't just silence it.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mock Remotion hooks so HomeScreen can render in a non-Remotion test env.
// (We test rendering *the real HomePage under shims*, not Remotion integration.)
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

import { HomeScreen } from "../HomeScreen";
import type { AppScreenProps } from "../../screenRegistry";

// The scene/meta props are unused by HomeScreen today (no timeline events
// are wired for this de-risk), so cast minimal fixtures through `unknown`.
const emptyProps = {} as unknown as AppScreenProps;

describe("HomeScreen", () => {
  it("mounts the real HomePage under shims without throwing", () => {
    expect(() => {
      const html = renderToStaticMarkup(<HomeScreen {...emptyProps} />);
      expect(html).toBeTruthy();
    }).not.toThrow();
  });

  it("renders 'Good afternoon' greeting (determinism: frozen 2026-04-15 15:30 EDT)", () => {
    const html = renderToStaticMarkup(<HomeScreen {...emptyProps} />);
    // Greeting header with the Ayush fixture's first name.
    expect(html).toContain("Good afternoon");
    expect(html).toContain("Ayush");
    // Empty-state body (no projects seeded) — HomePage should still render
    // its "No Projects Yet" CTA so we know the component mounted end-to-end
    // and not just the greeting fragment.
    expect(html).toContain("No Projects Yet");
    expect(html).toContain("Create Project");
  });
});
