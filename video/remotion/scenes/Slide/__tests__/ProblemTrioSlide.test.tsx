import { describe, expect, it, vi } from "vitest";

// Fonts load via FontFace at module eval — stub so primitives that import
// config/fonts don't explode under the Node runtime.
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
    useVideoConfig: vi.fn(() => ({
      fps: 60,
      width: 1920,
      height: 1080,
      durationInFrames: 2040,
    })),
  };
});

vi.mock("../../../primitives/SlideShell", () => ({
  SlideShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="slide-shell">{children}</div>
  ),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import { ProblemTrioSlide } from "../ProblemTrioSlide";

const renderAt = (frame: number): string => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(
    <ProblemTrioSlide theme="light" meta={undefined} />,
  );
};

describe("<ProblemTrioSlide />", () => {
  // The 5 boundary frames + tail-hold cover every choreography phase. Any
  // primitive throwing at one of these frames would catch real visual bugs
  // (e.g., undefined access in a halo / edge / underline computation).
  it.each([0, 110, 200, 300, 600, 1020, 1559, 1560, 2039])(
    "renders without throwing at frame %d",
    (frame) => {
      expect(() => renderAt(frame)).not.toThrow();
    },
  );

  it("paints the slide heading at the heading-typed frame", () => {
    const markup = renderAt(400); // well past the heading reveal
    expect(markup).toContain("modern ML workflow");
  });

  it("paints all three panel headlines once the copy phase completes", () => {
    const markup = renderAt(400);
    expect(markup).toContain("Six tools. Six mental models.");
    expect(markup).toContain("Five specialties, one hire.");
    expect(markup).toContain("AutoML hides the decisions that matter.");
  });

  it("renders the Panel 2 hero number `1.5` during the panel-2 focus window", () => {
    const markup = renderAt(900); // mid panel-2 window (600-1020)
    expect(markup).toContain("1.5");
    expect(markup).toContain("of 5 disciplines");
    expect(markup).toContain("Stack Overflow Dev Survey, 2024");
  });

  it("renders the pentagon tool labels during panel-1 focus", () => {
    const markup = renderAt(550);
    for (const label of ["jupyter", "pandas", "sklearn", "mlflow", "streamlit"]) {
      expect(markup).toContain(label);
    }
  });

  it("renders the RAW / APPROVAL / MODEL pipeline during panel-3 focus", () => {
    const markup = renderAt(1300);
    expect(markup).toContain("RAW");
    expect(markup).toContain("APPROVAL");
    expect(markup).toContain("MODEL");
  });
});
