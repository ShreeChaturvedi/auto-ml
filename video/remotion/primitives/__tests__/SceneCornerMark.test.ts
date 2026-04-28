import { describe, expect, it, vi } from "vitest";

vi.mock("../../../config/fonts", () => ({
  REGULAR_FONT: {},
  TITLE_FONT: {},
  SERIF_FONT: {},
  MONOSPACE_FONT: { fontFamily: "mono" },
  ENDCARD_FONT: {},
  waitForFonts: async () => {},
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SceneCornerMark } from "../SceneCornerMark";

describe("<SceneCornerMark />", () => {
  const render = (scene: number, total?: number) =>
    renderToStaticMarkup(
      React.createElement(SceneCornerMark, { scene, total }),
    );

  it("renders the scene counter text", () => {
    expect(render(1)).toContain("scene 1 / 6");
    expect(render(5)).toContain("scene 5 / 6");
  });

  it("honors a custom total", () => {
    expect(render(2, 8)).toContain("scene 2 / 8");
  });

  it("defaults total to 6", () => {
    expect(render(3)).toContain("/ 6");
  });

  it("pins to the top-right corner (right: 200, top: 96)", () => {
    const markup = render(4);
    expect(markup).toMatch(/right:\s*200px/);
    expect(markup).toMatch(/top:\s*96px/);
  });

  it("is pointer-events:none so it never intercepts clicks", () => {
    expect(render(1)).toMatch(/pointer-events:\s*none/);
  });
});
