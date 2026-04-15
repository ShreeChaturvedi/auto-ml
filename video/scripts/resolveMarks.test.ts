import { describe, expect, it } from "vitest";
import { resolveMarks, type AlignmentBlock } from "./resolveMarks";

/**
 * Tiny helper to build an alignment block whose character timestamps are
 * just `index * 0.1 seconds`. With fps=60 that yields integer frame counts
 * (0, 6, 12, 18, …) so assertions are easy to read.
 */
const makeAlignment = (text: string): AlignmentBlock => {
  const characters = Array.from(text);
  const character_start_times_seconds = characters.map((_, i) => i * 0.1);
  const character_end_times_seconds = characters.map((_, i) => (i + 1) * 0.1);
  return {
    characters,
    character_start_times_seconds,
    character_end_times_seconds,
  };
};

const FPS = 60;

describe("resolveMarks", () => {
  it("resolves a mark at the start of the script to frame 0", () => {
    const raw = "{{GO}}Hello world";
    const alignment = makeAlignment("Hello world");
    const marks = resolveMarks(raw, alignment, FPS);
    expect(marks.GO).toBe(0);
  });

  it("resolves a mark mid-script to the frame of the next character", () => {
    // "Hello world" — mark sits before 'w' at stripped index 6.
    const raw = "Hello {{NOW}}world";
    const alignment = makeAlignment("Hello world");
    const marks = resolveMarks(raw, alignment, FPS);
    // char 6 = 'w' starts at 0.6s → frame 36 @ 60fps
    expect(marks.NOW).toBe(36);
  });

  it("clamps a mark at the end of the script to the last-char end time", () => {
    const raw = "Goodbye{{DONE}}";
    const alignment = makeAlignment("Goodbye"); // length 7
    const marks = resolveMarks(raw, alignment, FPS);
    // last char end = 0.7s → frame 42
    expect(marks.DONE).toBe(42);
  });

  it("two consecutive marks {{A}}{{B}} both point to the same frame", () => {
    const raw = "foo {{A}}{{B}}bar";
    const alignment = makeAlignment("foo bar");
    const marks = resolveMarks(raw, alignment, FPS);
    // stripped index of 'b' = 4, time = 0.4s, frame = 24
    expect(marks.A).toBe(24);
    expect(marks.B).toBe(24);
    expect(marks.A).toBe(marks.B);
  });

  it("handles multi-byte UTF-8 content by indexing per code point", () => {
    // "hi 🚀 go" — 🚀 is one USV, so Array.from = ['h','i',' ','🚀',' ','g','o']
    // Mark placed right before 🚀 → stripped index 3.
    const raw = "hi {{LAUNCH}}🚀 go";
    const alignment = makeAlignment("hi 🚀 go");
    expect(alignment.characters.length).toBe(7);
    const marks = resolveMarks(raw, alignment, FPS);
    // time 0.3s → frame 18
    expect(marks.LAUNCH).toBe(18);
  });

  it("parses mark names with special chars: !, -, _, digits", () => {
    const raw = "A{{AGENTICALLY!}}B{{A-B}}C{{SECTION_3}}D";
    const alignment = makeAlignment("ABCD");
    const marks = resolveMarks(raw, alignment, FPS);
    // 'B' at index 1 → 0.1s → 6
    expect(marks["AGENTICALLY!"]).toBe(6);
    // 'C' at index 2 → 0.2s → 12
    expect(marks["A-B"]).toBe(12);
    // 'D' at index 3 → 0.3s → 18
    expect(marks["SECTION_3"]).toBe(18);
  });

  it("throws when alignment.characters length doesn't match stripped text length", () => {
    const raw = "Hello {{M}}world";
    // alignment only describes 5 chars but stripped text has 11
    const bad: AlignmentBlock = {
      characters: ["H", "e", "l", "l", "o"],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
    };
    expect(() => resolveMarks(raw, bad, FPS)).toThrow(
      /stripped text length \(11\) does not match alignment\.characters length \(5\)/,
    );
  });
});
