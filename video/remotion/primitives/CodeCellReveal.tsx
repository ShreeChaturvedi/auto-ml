import React from "react";
import { useCurrentFrame } from "remotion";
import { MONOSPACE_FONT } from "../../config/fonts";
import { ARCH_PALETTE } from "../../config/arch-layout";

/**
 * Character-by-character code reveal, styled to match the landing page's
 * notebook cell mock (see `frontend/src/demo/landing/NotebookDeepDivePreview.tsx`).
 *
 * Visuals: rounded card, chrome strip (run icon + `[N]` badge), monospace
 * body with per-line gutter line numbers and minimal token coloring. The
 * reveal is the typewriter math from `TypeOnText` lifted to multi-line —
 * characters visible = `progress * code.length`, rounded — then sliced into
 * per-line views. Optional blinking caret at the tail.
 *
 * Why a new primitive rather than `MaskReveal` + Shiki? The landing mock
 * reveals code one char at a time (not a diagonal wipe), and the chrome
 * (run icon, line numbers, soft card) carries a specific editorial feel that
 * the VO leans on ("It's a LangGraph state graph…"). Keeping Shiki would
 * force a different reveal primitive; this one is simpler and on-brand.
 */

export type CodeCellRevealProps = {
  /** The source to reveal. Multi-line strings are split on `\n`. */
  code: string;
  /** Highlight language. `ts` and `py` get lightweight tokenizers; everything
   *  else falls through as plain monospace. Default `ts`. */
  lang?: "ts" | "py" | "plain";
  /** Frame at which the reveal begins. Characters revealed before this
   *  count as zero. Default 0. */
  startFrame?: number;
  /** How many frames the full reveal takes. Characters scale linearly across
   *  this window (so `charsPerFrame = code.length / durationFrames`). Default
   *  is chosen so a 300-char snippet reveals over ~2.5s at 60fps. */
  durationFrames?: number;
  /** Show a blinking caret at the tail while revealing (and for a beat
   *  after). Default `true`. */
  caret?: boolean;
  /** Label rendered in the chrome bar (e.g. `graph.ts`). */
  filename?: string;
  /** Execution-order badge shown in the chrome. Default `1`. */
  executionOrder?: number;
  /** Font-size (px) applied to the code body. Default 18. */
  fontSize?: number;
  /** Line-height multiplier. Default 1.5. */
  lineHeight?: number;
  /** Whether to show the gutter column with line numbers. Default `true`. */
  showLineNumbers?: boolean;
};

/** One blink every 60f (30 on, 30 off) — matches `TypeOnText`. */
const CARET_BLINK_PERIOD = 30;
const CARET_TAIL_HOLD = 30;

export const CodeCellReveal: React.FC<CodeCellRevealProps> = ({
  code,
  lang = "ts",
  startFrame = 0,
  durationFrames = 150,
  caret = true,
  filename,
  executionOrder = 1,
  fontSize = 18,
  lineHeight = 1.5,
  showLineNumbers = true,
}) => {
  const frame = useCurrentFrame();
  const charsVisible = computeCharsVisible(
    frame,
    startFrame,
    durationFrames,
    code.length,
  );
  const isComplete = charsVisible >= code.length;
  const completeFrame = startFrame + durationFrames;
  const caretHidden =
    !caret || (isComplete && frame > completeFrame + CARET_TAIL_HOLD);
  const caretOn =
    !caretHidden && Math.floor(frame / CARET_BLINK_PERIOD) % 2 === 0;

  const lines = React.useMemo(() => code.split("\n"), [code]);
  const revealedLines = React.useMemo(
    () => sliceLinesByChars(lines, charsVisible),
    [lines, charsVisible],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: ARCH_PALETTE.paper,
        border: `1px solid ${ARCH_PALETTE.hairline}`,
        borderRadius: 10,
        overflow: "hidden",
        width: "100%",
      }}
    >
      {filename ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 36,
            padding: "0 12px",
            borderBottom: `1px solid ${ARCH_PALETTE.hairline}`,
            background: ARCH_PALETTE.paperAlt,
          }}
        >
          <RunGlyph />
          <span
            style={{
              ...MONOSPACE_FONT,
              fontSize: 13,
              color: ARCH_PALETTE.mute,
            }}
          >
            {`[${executionOrder}]`}
          </span>
          <span
            style={{
              ...MONOSPACE_FONT,
              fontSize: 13,
              color: ARCH_PALETTE.mute,
              marginLeft: "auto",
            }}
          >
            {filename}
          </span>
        </div>
      ) : null}
      <div
        style={{
          padding: "12px 14px",
          ...MONOSPACE_FONT,
          fontSize,
          lineHeight,
          color: ARCH_PALETTE.ink,
        }}
      >
        {revealedLines.map((line, idx) => {
          const isTail = idx === revealedLines.length - 1 && !isComplete;
          return (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: showLineNumbers ? "auto 1fr" : "1fr",
                columnGap: 14,
                minHeight: `${fontSize * lineHeight}px`,
              }}
            >
              {showLineNumbers ? (
                <span
                  style={{
                    textAlign: "right",
                    color: ARCH_PALETTE.mute,
                    fontSize: Math.max(11, fontSize - 5),
                    userSelect: "none",
                    opacity: 0.6,
                  }}
                >
                  {idx + 1}
                </span>
              ) : null}
              <span style={{ whiteSpace: "pre" }}>
                {renderLine(line, lang)}
                {isTail && !caretHidden ? (
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: "0.55em",
                      marginLeft: 2,
                      opacity: caretOn ? 1 : 0,
                      color: ARCH_PALETTE.accentBlue,
                    }}
                  >
                    |
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Pure: how many characters of `code` should be visible at `frame`, given a
 * reveal window `[startFrame, startFrame + durationFrames]`. Exported for
 * testing.
 */
export const computeCharsVisible = (
  frame: number,
  startFrame: number,
  durationFrames: number,
  totalChars: number,
): number => {
  if (durationFrames <= 0 || totalChars <= 0) return 0;
  const ratio = (frame - startFrame) / durationFrames;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return totalChars;
  return Math.floor(ratio * totalChars);
};

/**
 * Pure: given a lines array and a total visible-char budget, return the
 * sliced lines (including trailing empty strings so the tail caret renders
 * at an empty line too). Exported for testing.
 */
export const sliceLinesByChars = (
  lines: string[],
  charsVisible: number,
): string[] => {
  if (charsVisible <= 0) return [""];
  const out: string[] = [];
  let remaining = charsVisible;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (remaining >= line.length + 1 /* for the `\n` we consumed */) {
      out.push(line);
      remaining -= line.length + 1;
    } else {
      out.push(line.slice(0, remaining));
      remaining = 0;
      break;
    }
    if (i === lines.length - 1) break;
  }
  // If we consumed every character, out already contains every line.
  if (out.length === 0) out.push("");
  return out;
};

// ---- Tiny Run glyph (SVG play triangle) -----------------------------------

const RunGlyph: React.FC = () => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 12 12"
    aria-hidden="true"
    style={{ flex: "none" }}
  >
    <path d="M3 2 L10 6 L3 10 Z" fill={ARCH_PALETTE.ink} />
  </svg>
);

// ---- Minimal token coloring ----------------------------------------------
// These tokenizers are intentionally tiny — the landing mock relies on
// muted color-per-type, not a real parser. Strings, comments, keywords,
// and numbers carry the only coloring; everything else renders as ink.

const TS_KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "of",
  "record",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "yield",
]);

const PY_KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const COLOR_KEYWORD = "#8B5CF6"; // violet
const COLOR_STRING = "#16A34A"; // green
const COLOR_COMMENT = "rgba(23,23,23,0.45)"; // muted
const COLOR_NUMBER = "#D97706"; // amber
const COLOR_FUNCTION = ARCH_PALETTE.accentBlue;

type Token = {
  text: string;
  color?: string;
  italic?: boolean;
  weight?: number;
};

const renderLine = (line: string, lang: "ts" | "py" | "plain"): React.ReactNode => {
  if (lang === "plain" || line.length === 0) {
    return line.length === 0 ? " " : line;
  }
  const tokens = lang === "ts" ? tokenizeTs(line) : tokenizePy(line);
  return tokens.map((t, i) => (
    <span
      key={i}
      style={{
        color: t.color ?? ARCH_PALETTE.ink,
        fontStyle: t.italic ? "italic" : "normal",
        fontWeight: t.weight ?? undefined,
      }}
    >
      {t.text}
    </span>
  ));
};

const tokenizeTs = (line: string): Token[] =>
  tokenizeWithKeywordSet(line, TS_KEYWORDS, {
    lineComment: "//",
    strings: ["'", '"', "`"],
  });

const tokenizePy = (line: string): Token[] =>
  tokenizeWithKeywordSet(line, PY_KEYWORDS, {
    lineComment: "#",
    strings: ["'", '"'],
  });

type TokenizerOpts = {
  lineComment: string;
  strings: string[];
};

const tokenizeWithKeywordSet = (
  line: string,
  keywords: Set<string>,
  opts: TokenizerOpts,
): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    // Whitespace
    if (/\s/.test(line[i]!)) {
      let j = i + 1;
      while (j < line.length && /\s/.test(line[j]!)) j += 1;
      tokens.push({ text: line.slice(i, j) });
      i = j;
      continue;
    }
    // Line comment
    if (line.slice(i, i + opts.lineComment.length) === opts.lineComment) {
      tokens.push({ text: line.slice(i), color: COLOR_COMMENT, italic: true });
      i = line.length;
      continue;
    }
    // String
    if (opts.strings.includes(line[i]!)) {
      const quote = line[i]!;
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "\\") {
          j += 2;
          continue;
        }
        if (line[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ text: line.slice(i, j), color: COLOR_STRING });
      i = j;
      continue;
    }
    // Number
    if (/\d/.test(line[i]!)) {
      let j = i + 1;
      while (j < line.length && /[\d._]/.test(line[j]!)) j += 1;
      tokens.push({ text: line.slice(i, j), color: COLOR_NUMBER });
      i = j;
      continue;
    }
    // Identifier / keyword
    if (/[A-Za-z_$]/.test(line[i]!)) {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_$]/.test(line[j]!)) j += 1;
      const word = line.slice(i, j);
      if (keywords.has(word)) {
        tokens.push({ text: word, color: COLOR_KEYWORD, weight: 600 });
      } else if (line[j] === "(") {
        tokens.push({ text: word, color: COLOR_FUNCTION });
      } else {
        tokens.push({ text: word });
      }
      i = j;
      continue;
    }
    // Fallback single-char passthrough
    tokens.push({ text: line[i]! });
    i += 1;
  }
  return tokens;
};
