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
    useVideoConfig: vi.fn(() => ({ fps: 60, width: 1920, height: 1080, durationInFrames: 480 })),
  };
});

vi.mock("../../../primitives/SlideShell", () => ({
  SlideShell: ({ eyebrow, children }: { eyebrow?: string; children: React.ReactNode }) => (
    <div data-testid="slide-shell">
      {eyebrow ? <div data-testid="eyebrow">{eyebrow}</div> : null}
      {children}
    </div>
  ),
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import { AICollaborationSlide } from "../AICollaborationSlide";

const renderAt = (frame: number) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(<AICollaborationSlide theme="light" meta={undefined} />);
};

describe("<AICollaborationSlide />", () => {
  it("renders without throwing across phase-boundary frames", () => {
    for (const frame of [0, 60, 150, 300, 420, 479]) {
      expect(() => renderAt(frame)).not.toThrow();
    }
  });

  it("renders the AI COLLABORATION eyebrow and 'collaborators' flourish target", () => {
    const markup = renderAt(60);
    expect(markup).toContain("AI COLLABORATION");
    expect(markup).toContain("collaborators");
  });

  it("renders all 3 collaborator card titles after the content phase", () => {
    const markup = renderAt(420);
    expect(markup).toContain("OpenAI API");
    expect(markup).toContain("Google Gemini");
    expect(markup).toContain("Cursor");
  });

  it("renders the 3 backend/frontend/gitlab corner chips", () => {
    const markup = renderAt(420);
    expect(markup).toContain("backend/services/llm");
    expect(markup).toContain("frontend/components");
    expect(markup).toContain("gitlab.csi.miamioh.edu");
  });

  it("renders all 3 NDJSON tape pill labels by the tape settle frame", () => {
    const markup = renderAt(420);
    expect(markup).toContain("openai.chat.completions");
    expect(markup).toContain("gemini.generate_content");
    expect(markup).toContain("cursor.mr.review");
  });

  it("includes a scale transform on the Gemini card's hero +1 badge", () => {
    const markup = renderAt(450);
    expect(markup).toContain("+1");
    expect(markup).toContain("transform:scale(");
  });

  it("renders the methodology strip text after the hold begins", () => {
    const markup = renderAt(475);
    expect(markup).toContain("eleven sprints");
    expect(markup).toContain("one engine");
  });
});
