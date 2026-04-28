import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../config/fonts", () => ({
  REGULAR_FONT: { fontFamily: "sans-serif", fontWeight: 500 },
  TITLE_FONT: { fontFamily: "sans-serif", fontWeight: 700 },
  SERIF_FONT: { fontFamily: "serif", fontWeight: 400 },
  MONOSPACE_FONT: { fontFamily: "monospace", fontWeight: 500 },
  ENDCARD_FONT: { fontFamily: "sans-serif", fontWeight: 600 },
  waitForFonts: async () => {},
}));

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: vi.fn(() => 0),
    useVideoConfig: vi.fn(() => ({ fps: 60, width: 1920, height: 1080, durationInFrames: 2760 })),
  };
});

vi.mock("../../../primitives/AgentEdge", () => ({
  AgentEdge: () => null,
}));

vi.mock("../../../primitives/CounterStrip", () => ({
  CounterStrip: () => null,
}));

vi.mock("../../../primitives/GraphNode", () => ({
  GraphNode: () => null,
}));

vi.mock("../../../primitives/MaskReveal", () => ({
  MaskReveal: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../../primitives/MotionLine", () => ({
  MotionLine: () => null,
}));

vi.mock("../../../primitives/NDJSONTape", () => ({
  NDJSONTape: () => null,
}));

vi.mock("../../../primitives/SlideShell", () => ({
  SlideShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="slide-shell">{children}</div>
  ),
}));

vi.mock("../../../primitives/useStaggeredFadeIn", () => ({
  useStaggeredFadeIn: (count: number) =>
    Array.from({ length: count }, () => ({ opacity: 1, transform: "none" })),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import { ArchPullbackSlide } from "../ArchPullbackSlide";

const renderAt = (frame: number) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(<ArchPullbackSlide theme="light" meta={undefined} />);
};

const getBlackOverlayOpacity = (markup: string): number => {
  const match = markup.match(/background:#000;opacity:([^;]+);pointer-events:none/);
  if (!match?.[1]) {
    throw new Error("Black overlay opacity not found in rendered markup");
  }
  return Number(match[1]);
};

describe("<ArchPullbackSlide />", () => {
  it("does not reach a full-black hold before the scene boundary", () => {
    const markup = renderAt(2658);

    expect(getBlackOverlayOpacity(markup)).toBeLessThan(0.99);
  });

  it("still reaches full black at the final frame", () => {
    const markup = renderAt(2759);

    expect(getBlackOverlayOpacity(markup)).toBeGreaterThan(0.99);
  });
});
