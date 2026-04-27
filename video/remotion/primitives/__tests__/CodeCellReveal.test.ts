import { describe, expect, it, vi } from "vitest";

vi.mock("../../../config/fonts", () => ({
  REGULAR_FONT: {},
  TITLE_FONT: {},
  SERIF_FONT: {},
  MONOSPACE_FONT: { fontFamily: "monospace" },
  ENDCARD_FONT: {},
  waitForFonts: async () => {},
}));

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: vi.fn(() => 0),
  };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCurrentFrame } from "remotion";
import {
  CodeCellReveal,
  computeCharsVisible,
  sliceLinesByChars,
  type CodeCellRevealProps,
} from "../CodeCellReveal";

const defaultProps: CodeCellRevealProps = {
  code: "const x = 1;\nconst y = 2;",
  lang: "ts",
  startFrame: 0,
  durationFrames: 30,
};

const renderAt = (frame: number, props: Partial<CodeCellRevealProps> = {}) => {
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  return renderToStaticMarkup(
    React.createElement(CodeCellReveal, { ...defaultProps, ...props }),
  );
};

/** Drop the span/style scaffolding so we can assert on visible text. */
const stripTags = (markup: string): string => markup.replace(/<[^>]+>/g, "");

describe("computeCharsVisible", () => {
  it("returns 0 before the reveal window opens", () => {
    expect(computeCharsVisible(-10, 0, 60, 120)).toBe(0);
    expect(computeCharsVisible(0, 30, 60, 120)).toBe(0);
  });

  it("returns 0 when the code is empty", () => {
    expect(computeCharsVisible(100, 0, 60, 0)).toBe(0);
  });

  it("returns 0 when the duration is zero or negative", () => {
    expect(computeCharsVisible(50, 0, 0, 120)).toBe(0);
    expect(computeCharsVisible(50, 0, -10, 120)).toBe(0);
  });

  it("returns totalChars at the end of the reveal window", () => {
    expect(computeCharsVisible(60, 0, 60, 120)).toBe(120);
  });

  it("returns totalChars well past the end of the reveal window", () => {
    expect(computeCharsVisible(600, 0, 60, 120)).toBe(120);
  });

  it("grows linearly across the reveal window", () => {
    // halfway through a 60f window should reveal half the 120 chars
    expect(computeCharsVisible(30, 0, 60, 120)).toBe(60);
    // quarter-way: a quarter of the chars
    expect(computeCharsVisible(15, 0, 60, 120)).toBe(30);
  });

  it("respects a non-zero startFrame", () => {
    // reveal window is [100, 160]; 30f in should be halfway
    expect(computeCharsVisible(130, 100, 60, 120)).toBe(60);
  });
});

describe("sliceLinesByChars", () => {
  it("returns a single empty line when budget is 0", () => {
    expect(sliceLinesByChars(["abc", "def"], 0)).toEqual([""]);
  });

  it("returns the first line (partial) when the budget cuts mid-line", () => {
    expect(sliceLinesByChars(["hello", "world"], 3)).toEqual(["hel"]);
  });

  it("returns the first full line + next partial when the budget crosses a newline", () => {
    // "hello" (5) + "\n" (1) + "wor" (3) = 9 chars
    expect(sliceLinesByChars(["hello", "world"], 9)).toEqual(["hello", "wor"]);
  });

  it("returns all lines when the budget covers every char", () => {
    expect(sliceLinesByChars(["hello", "world"], 99)).toEqual([
      "hello",
      "world",
    ]);
  });

  it("handles empty lines in the middle of the snippet", () => {
    expect(sliceLinesByChars(["a", "", "c"], 4)).toEqual(["a", "", "c"]);
  });
});

describe("<CodeCellReveal /> rendering", () => {
  it("renders an empty body before the reveal window opens", () => {
    const markup = renderAt(-10);
    expect(markup).not.toContain("const");
  });

  it("reveals characters progressively across the window", () => {
    const midText = stripTags(renderAt(15));
    // 25 total chars → halfway should include the first line
    expect(midText).toContain("const x");
    expect(midText).not.toContain("const y = 2;");
  });

  it("reveals the full snippet after the window ends", () => {
    // Tokens render as separate <span>s (one per keyword/identifier/etc.), so
    // the raw "const y = 2;" substring won't appear verbatim. Strip tags and
    // test the visible text instead.
    const fullText = stripTags(renderAt(40));
    expect(fullText).toContain("const y = 2;");
  });

  it("renders the filename chrome when `filename` is supplied", () => {
    const markup = renderAt(40, { filename: "graph.ts" });
    expect(markup).toContain("graph.ts");
  });

  it("omits the chrome strip when `filename` is not supplied", () => {
    const markup = renderAt(40);
    expect(markup).not.toContain("[1]"); // execution-order badge lives in chrome
  });

  it("renders gutter line numbers by default", () => {
    const markup = renderAt(40);
    // `>1<` and `>2<` as gutter cells — guarded against matching "1;" or "2;"
    // by requiring the right-aligned span formatting. The simplest way to
    // probe is to check for the two expected line-number digits.
    expect(markup).toMatch(/>1</);
    expect(markup).toMatch(/>2</);
  });

  it("drops gutter when showLineNumbers=false", () => {
    const markup = renderAt(40, { showLineNumbers: false });
    // The digit "1" still appears in `const x = 1;` body — so we check
    // that the gutter column's distinctive text-align/right styles are gone.
    expect(markup).not.toMatch(/text-align:right/);
  });

  it("applies TS keyword highlighting to `const`", () => {
    const markup = renderAt(40);
    // COLOR_KEYWORD is #8B5CF6 (violet)
    expect(markup).toContain("#8B5CF6");
  });

  it("tokenizes python with `lang=py` (comment color on # line)", () => {
    const markup = renderAt(40, {
      code: "# a python comment\ndef f(x): return x",
      lang: "py",
    });
    // Comment color is the muted rgba — quick sanity check
    expect(markup).toContain("rgba(23,23,23,0.45)");
  });

  it("falls through to plain text when lang=plain", () => {
    const markup = renderAt(40, {
      code: "const x = 1;",
      lang: "plain",
    });
    // No token coloring — keyword violet should not appear
    expect(markup).not.toContain("#8B5CF6");
    expect(markup).toContain("const x = 1;");
  });

  it("hides the caret when caret=false", () => {
    const markup = renderAt(15, { caret: false });
    // The caret span carries color: accentBlue (#1D4ED8) — its absence is
    // our "no caret rendered" proxy. The body/chrome have their own colors
    // so we look for the literal `|` glyph.
    expect(markup).not.toContain(">|<");
  });

  it("renders a caret during the reveal window by default", () => {
    const markup = renderAt(10); // mid-reveal
    expect(markup).toContain(">|<");
  });

  it("hides the caret after the tail hold expires", () => {
    // window end = 30, tail hold = 30 → caret hidden at frame > 60
    const markup = renderAt(120);
    expect(markup).not.toContain(">|<");
  });
});
