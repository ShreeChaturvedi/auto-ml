import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../../../config/fonts";
import type { Theme } from "../../../../config/themes";
import { COLORS } from "../../../../config/themes";
import { FlourishUnderline } from "../../../primitives/FlourishUnderline";
import { ScaleInNumber } from "../../../primitives/ScaleInNumber";

// -----------------------------------------------------------------------------
// Panel 2 visual — stacked skill-stack hero.
//
// Previous layout placed the "1.5" hero in a side column with a side-by-side
// vertical bar chart. At fontSize 112 + letterSpacing -0.04em the right column
// pushed past the 472 px usable width inside `overflow: hidden`, clipping the
// glyph. New layout stacks everything centered, top-down, so the hero owns
// the full panel width and the data bars run horizontally below.
//
// Stack order (top → bottom):
//   1. "1.5" hero — fontSize 140, centered, ScaleInNumber spring entry
//   2. FlourishUnderline — sustained (drawOut={false}) under the hero glyph
//   3. "of 5 disciplines" — uppercase caption
//   4. "Stack Overflow Dev Survey, 2024" — source line
//   5. Horizontal bar row — 5 compact bars, label above each track, color
//      interpolates neutral → ACCENT based on the row's normalized fill
// -----------------------------------------------------------------------------

type SkillRow = { label: string; fill: number };

const SKILL_ROWS: readonly SkillRow[] = [
  { label: "SQL", fill: 0.7 },
  { label: "Python", fill: 0.8 },
  { label: "stats", fill: 0.55 },
  { label: "k8s", fill: 0.3 },
  { label: "MLOps", fill: 0.25 },
] as const;

const HERO_FONT_SIZE = 140;
const HERO_GLYPH_WIDTH = 178; // measured width for the "1.5" string
const FLOURISH_DELAY_OFFSET = 6;

const BAR_TRACK_W = 72;
const BAR_TRACK_H = 24;
const BAR_GAP = 16;
const BAR_LABEL_GAP = 6;
const BAR_DRAW_FRAMES = 18;
const BAR_STAGGER = 12;
const BAR_ROW_LABEL_FONT_SIZE = 11;

/** Lerp two #RRGGBB strings via componentwise interpolation. */
const mixHex = (a: string, b: string, t: number): string => {
  const parse = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
};

export const Panel2SkillStack: React.FC<{
  theme: Theme;
  focusStart: number;
}> = ({ theme, focusStart }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  // Beat schedule:
  //   t+0       hero scale-in (24f spring)
  //   t+30      flourish draws under the hero
  //   t+80      caption pair fades in
  //   t+110     bars draw left → right with stagger
  const heroDelay = focusStart;
  const flourishDelay = focusStart + 30 + FLOURISH_DELAY_OFFSET;
  const captionDelay = focusStart + 80;
  const barsBase = focusStart + 110;

  const captionOpacity = interpolate(
    frame,
    [captionDelay, captionDelay + 24],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Light theme neutral track. The color interpolation runs against the
  // ACCENT_COLOR so high-fill bars sit at the brand blue and low-fill bars
  // stay near the neutral border. BORDER_COLOR is itself rgb-encoded; for
  // the lerp we need a #RRGGBB neutral. Pull from theme tokens.
  const neutral = theme === "light" ? "#D4D4D4" : "#3A3A3A";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 0,
      }}
    >
      {/* 1. Hero number — full panel width, centered, with breathing room
       *    around the kerning so the "5" doesn't clip on the right. */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          ...TITLE_FONT,
          fontSize: HERO_FONT_SIZE,
          fontWeight: 600,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: c.ACCENT_COLOR,
        }}
      >
        <ScaleInNumber value="1.5" delay={heroDelay} />
      </div>

      {/* 2. FlourishUnderline — sustained (drawOut={false}) so it doesn't
       *    retract mid-window. Width matches the hero glyph so the swoosh
       *    sits below the number, not under empty space. */}
      <div
        style={{
          width: HERO_GLYPH_WIDTH,
          marginTop: -8,
        }}
      >
        <FlourishUnderline
          delay={flourishDelay}
          drawOut={false}
          color={c.ACCENT_COLOR}
          width={HERO_GLYPH_WIDTH}
          height={16}
          strokeWidth={2}
        />
      </div>

      {/* 3. Caption pair — uppercase eyebrow + source line. */}
      <div
        style={{
          ...REGULAR_FONT,
          fontWeight: 600,
          fontSize: 14,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: captionOpacity,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginTop: 14,
          textAlign: "center",
        }}
      >
        of 5 disciplines
      </div>
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 13,
          color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: captionOpacity,
          marginTop: 6,
          textAlign: "center",
        }}
      >
        Stack Overflow Dev Survey, 2024
      </div>

      {/* 5. Bar row — 5 bars laid out horizontally so the total width
       *    (72×5 + 16×4 = 424) fits inside the 472 panel inner width. Label
       *    sits above each track. */}
      <div
        style={{
          display: "flex",
          gap: BAR_GAP,
          marginTop: 22,
        }}
      >
        {SKILL_ROWS.map((row, i) => {
          const barStart = barsBase + i * BAR_STAGGER;
          const fillProgress = interpolate(
            frame,
            [barStart, barStart + BAR_DRAW_FRAMES],
            [0, 1],
            { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const fillWidth = BAR_TRACK_W * row.fill * fillProgress;
          const settled = fillProgress >= 0.999;
          const labelOpacity = interpolate(
            frame,
            [barStart - 4, barStart + 12],
            [0, 1],
            { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const fillColor = mixHex(neutral, c.ACCENT_COLOR, row.fill);
          const labelColor = settled
            ? c.WORD_COLOR_ON_BG_APPEARED
            : c.WORD_COLOR_ON_BG_GREYED;

          return (
            <div
              key={row.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  ...MONOSPACE_FONT,
                  fontSize: BAR_ROW_LABEL_FONT_SIZE,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: labelColor,
                  opacity: labelOpacity,
                  marginBottom: BAR_LABEL_GAP,
                  lineHeight: 1,
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  position: "relative",
                  width: BAR_TRACK_W,
                  height: BAR_TRACK_H,
                  borderRadius: 4,
                  background: c.BORDER_COLOR,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: fillWidth,
                    borderRadius: 4,
                    background: fillColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
