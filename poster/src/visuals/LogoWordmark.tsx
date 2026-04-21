import React from "react";
import { COLORS } from "../tokens";

/**
 * Full-name brand lockup — the square A mark + the product name built
 * natively out of perfectly drafted SVG paths.
 *
 * Every glyph — uppercase and lowercase — is designed on the same grid
 * and in the same "hand" as the central A mark. The logic applies seamlessly:
 *   • Thin geometric lines, round caps, 2.5-unit stroke.
 *   • Apex dots on A, P, and the lowercase i perfectly aligned on y=4.
 *   • An elegant "dimming" structural echo logic (opacity=0.4) applied carefully
 *     to one distinct stem or arch of every letter across the wordmark to give 
 *     a completely branded, proprietary typeface feel.
 */

export type LogoWordmarkProps = {
  height: number;
  color?: string;
};

const MARK_VIEWBOX_H = 28;
const MARK_STROKE = 2.5;
const MARK_DOT_Y = 4;
const MARK_DOT_R = 3.15;

type MarkDef = {
  width: number;
  paths: ReadonlyArray<{ d: string; dimmed?: boolean }>;
  dotX?: number;
};

// All letters mathematically drafted to match the A_MARK's cap-height of 20 
// and x-height of 14, with meticulous smooth semi-circle logic for arcs.
const LETTERS: Record<string, MarkDef> = {
  A: {
    width: 22,
    paths: [
      { d: "M9,8 L0,28" },
      { d: "M4,19 L14.5,19" },
      { d: "M13,8 L22,28", dimmed: true },
    ],
    dotX: 11,
  },
  P: {
    width: 11,
    paths: [
      { d: "M0,28 L0,8" },
      { d: "M3,8 A5,5 0 0,1 3,18" },
      { d: "M0,18 L3,18", dimmed: true },
    ],
    dotX: 1.5,
  },
  M: {
    width: 24,
    paths: [
      { d: "M0,28 L0,8" },
      { d: "M0,8 L12,20" },
      { d: "M12,20 L24,8", dimmed: true },
      { d: "M24,8 L24,28", dimmed: true },
    ],
  },
  L: {
    width: 14,
    paths: [
      { d: "M0,8 L0,28" },
      { d: "M0,28 L14,28", dimmed: true },
    ],
  },
  g: {
    width: 14,
    paths: [
      { d: "M7,14 A7,7 0 0,0 7,28 A7,7 0 0,0 7,14" },
      { d: "M14,19 L14,31 A7,7 0 0,1 0,31", dimmed: true },
    ],
  },
  e: {
    width: 14,
    paths: [
      { d: "M0,21 A7,7 0 1,1 12,26" },
      { d: "M2,21 L12,21", dimmed: true },
    ],
  },
  n: {
    width: 12,
    paths: [
      { d: "M0,14 L0,28" },
      { d: "M0,19 A6,6 0 0,1 12,19 L12,28", dimmed: true },
    ],
  },
  t: {
    width: 8,
    paths: [
      { d: "M4,8 L4,28" },
      { d: "M0,14 L8,14", dimmed: true },
    ],
  },
  i: {
    width: 7,
    paths: [{ d: "M3.5,14 L3.5,28", dimmed: true }],
    dotX: 3.5,
  },
  c: {
    width: 14,
    paths: [{ d: "M12,16 A7,7 0 1,0 12,26" }],
  },
  u: {
    width: 12,
    paths: [
      { d: "M0,14 L0,22 A6,6 0 0,0 12,22" },
      { d: "M12,14 L12,28", dimmed: true },
    ],
  },
  o: {
    width: 14,
    paths: [{ d: "M7,14 A7,7 0 0,0 7,28 A7,7 0 0,0 7,14" }],
  },
  l: {
    width: 2,
    paths: [{ d: "M1,8 L1,28" }],
  },
  a: {
    width: 14,
    paths: [
      { d: "M7,14 A7,7 0 0,0 7,28 A7,7 0 0,0 7,14" },
      { d: "M14,14 L14,28", dimmed: true },
    ],
  },
  f: {
    width: 10,
    paths: [
      { d: "M5,28 L5,13 A5,5 0 0,1 10,8" },
      { d: "M1,14 L9,14", dimmed: true },
    ],
  },
  r: {
    width: 10,
    paths: [
      { d: "M1,14 L1,28" },
      { d: "M1,18 A5,5 0 0,1 9,14", dimmed: true },
    ],
  },
  m: {
    width: 20,
    paths: [
      { d: "M0,14 L0,28" },
      { d: "M0,19 A5,5 0 0,1 10,19 L10,28" },
      { d: "M10,19 A5,5 0 0,1 20,19 L20,28", dimmed: true },
    ],
  },
};

const InlineMark: React.FC<{
  mark: MarkDef;
  capHeight: number;
  color: string;
}> = ({ mark, capHeight, color }) => {
  const scale = capHeight / 20;
  return (
    <svg
      width={mark.width * scale}
      height={MARK_VIEWBOX_H * scale}
      viewBox={`0 0 ${mark.width} ${MARK_VIEWBOX_H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: "block",
        overflow: "visible",
        flexShrink: 0,
      }}
      aria-hidden
    >
      {mark.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={color}
          strokeWidth={MARK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={p.dimmed ? 0.4 : 1}
        />
      ))}
      {mark.dotX !== undefined && (
        <circle cx={mark.dotX} cy={MARK_DOT_Y} r={MARK_DOT_R} fill={color} />
      )}
    </svg>
  );
};

export const LogoWordmark: React.FC<LogoWordmarkProps> = ({
  height,
  color = COLORS.INK,
}) => {
  // We use `flex` and distinct pixel margins to properly kern the wordmark
  // consistently entirely independent of text/font nodes.
  const scale = height / 20;

  // Spacing constraints for perfect legibility
  const LETTER_GAP = 3.5 * scale;
  const WORD_GAP = 14 * scale;

  const words = ["Agentic", "AutoML", "Platform"];

  return (
    <div
      role="img"
      aria-label="Agentic AutoML Platform"
      style={{
        display: "flex",
        alignItems: "flex-end", // Aligns the y=28 baselines natively
        gap: `${WORD_GAP}px`,
        color,
      }}
    >
      {words.map((word, wIdx) => (
        <div
          key={wIdx}
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: `${LETTER_GAP}px`,
          }}
        >
          {word.split("").map((char, cIdx) => {
            const mark = LETTERS[char];
            if (!mark) {
              console.warn(`Missing character mark for: ${char}`);
              return null;
            }
            return (
              <InlineMark
                key={cIdx}
                mark={mark}
                capHeight={height}
                color={color}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};
