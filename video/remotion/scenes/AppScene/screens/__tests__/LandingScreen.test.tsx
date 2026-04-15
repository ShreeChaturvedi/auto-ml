/**
 * LandingScreen smoke test: the Beat 1 orchestrator must mount its React
 * tree — ScrollViewport + overlays + ZoomMultiplexer + SFX — without
 * throwing under jsdom. The captured PNG won't "load" in jsdom but the
 * <Img> element should still render into the markup.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  const React = await import("react");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      fps: 60,
      width: 1920,
      height: 1080,
      durationInFrames: 3600,
    }),
    // jsdom doesn't expose a window for Remotion's image-timeline hooks, so
    // stub `<Img>` to a plain <img> that captures the src for assertion.
    Img: (props: React.ComponentProps<"img">) =>
      React.createElement("img", props),
    staticFile: (p: string) => `static:${p}`,
    Audio: (props: { src: string }) =>
      React.createElement("audio", { src: props.src }),
  };
});

import { LandingScreen } from "../LandingScreen";
import type { AppScreenProps } from "../../screenRegistry";

const minimalProps = {
  scene: {
    type: "app",
    screen: "landing",
    chrome: "none",
    timeline: [],
    durationInFrames: 3600,
  },
  meta: {
    scene: { type: "app" },
    from: 0,
    durationInFrames: 3600,
    chapter: null,
  },
} as unknown as AppScreenProps;

describe("LandingScreen", () => {
  it("mounts the scene without throwing", () => {
    expect(() => {
      const html = renderToStaticMarkup(<LandingScreen {...minimalProps} />);
      expect(html).toBeTruthy();
    }).not.toThrow();
  });

  it("renders the brand moments (nav wordmark + hero title)", () => {
    const html = renderToStaticMarkup(<LandingScreen {...minimalProps} />);
    // NavLive long wordmark (frame 0 — fully visible).
    expect(html).toContain("Agentic AutoML ToolChain");
    // HeroLive bright title (filter blur, but text is always in the DOM).
    expect(html).toContain("fastest way to build production ML models");
    // HeroLive shimmer ports the word "agentically.".
    expect(html).toContain("agentically.");
    // FooterAgentLive renders the AGENT wordmark SVG.
    expect(html).toContain("AGENT");
  });

  it("references the captured PNG via staticFile", () => {
    const html = renderToStaticMarkup(<LandingScreen {...minimalProps} />);
    expect(html).toContain("landing/landing-full.png");
  });
});
