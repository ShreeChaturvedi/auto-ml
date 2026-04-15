import React from "react";
import { Img, staticFile } from "remotion";
import { REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { MiamiMark } from "../../primitives/MiamiMark";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

// -----------------------------------------------------------------------------
// Finance-deck cards (14s / 840f). Vertical layout per member:
//   photo → name → majors → subtle divider → institution chip → bullets
//
// Six-phase budget. Each phase-end sets the next element's `delay`; per-column
// offsets (`COL_STAGGER`) stagger the second column behind the first so the
// slide reads left→right.
//
//   1.    0– 20   eyebrow + heading fade
//   2.   20– 70   both columns rise (photo + name visible)
//   3.   70–140   majors type in (LABEL_RATE)
//   4.  140–180   subtle divider draws + Miami chip fades
//   5.  180–330   per-column bullets stagger-fade (COL_STAGGER offset)
//   6.  330–840   hold
// -----------------------------------------------------------------------------
const PHASES = [20, 50, 70, 40, 150, 510] as const;
type SixPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];
type TwoCols = [StaggeredItem, StaggeredItem];

const COL_STAGGER = 30;
const BULLET_STAGGER = 14;

const AVATAR_SIZE = 200;
const AVATAR_BORDER = 3;
const COL_WIDTH = 500;
const COL_GAP = 160;

const DIVIDER_WIDTH = 72;
const DIVIDER_FRAMES = 28;

// Column-local frame offsets (added to each column's `base` frame).
const MAJORS_AFTER = 60;
const DIVIDER_AFTER = 115;
const MIAMI_AFTER = 140;
const BULLETS_AFTER = 175;

const TEAM = [
  {
    name: "Shree Chaturvedi",
    majors: "Computer Science & Software Engineering",
    avatar: "team/shree.jpeg",
    bullets: [
      "Designed the 6-phase agentic workflow and the LangGraph state machine that drives it.",
      "Built the preprocessing FSM and the approval-gate UX across every phase.",
      "Built the UI system — shadcn/ui components, Tailwind theme tokens, project-theme hooks.",
    ],
  },
  {
    name: "Ayush Yadav",
    majors: "Computer Science & Software Engineering",
    avatar: "team/ayush.jpeg",
    bullets: [
      "Built the Monaco + Jedi notebook runtime with live WebSocket sync.",
      "Stood up the Docker sandbox — read-only rootfs, non-root user, CPU / memory limits.",
      "Wrote the eval runner and the Optuna study streaming UI.",
    ],
  },
] as const;

const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 72,
  letterSpacing: "-0.025em",
  lineHeight: 1.05,
  textAlign: "center",
};

const NAME_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontWeight: 700,
  fontSize: 40,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  textAlign: "center",
};

const MAJORS_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 20,
  letterSpacing: "0.005em",
  lineHeight: 1.3,
  textAlign: "center",
  minHeight: 28,
};

const INSTITUTION_LABEL_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 15,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  lineHeight: 1.2,
};

const BULLET_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 18,
  lineHeight: 1.5,
  letterSpacing: "-0.005em",
};

/**
 * TeamSlide — "built by" slide, 14s (840f). Two engineers in a finance-deck
 * format: photo, name, majors, subtle divider, institutional chip. Supporting
 * bullets fade in after the identity card resolves.
 *
 * The heading, photos, names, and card chrome are identical per column; all
 * differentiation is in the content + the 30f column stagger.
 */
export const TeamSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const c = COLORS[theme];
  const [, pCols] = useTimeline([...PHASES]) as SixPhases;

  const cols = useStaggeredFadeIn(TEAM.length, {
    step: COL_STAGGER,
    startDelay: pCols.start,
    translateY: 24,
    damping: 200,
  }) as TwoCols;

  const heading = useFadeIn({ translateY: 8, delay: 0 });

  return (
    <SlideShell theme={theme} eyebrow="BUILT BY" pageNumber="03">
      <div
        style={{
          ...HEADING_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: heading.opacity,
          transform: heading.transform,
          marginBottom: 56,
        }}
      >
        The Team
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: COL_GAP }}>
        {TEAM.map((member, i) => (
          <MemberColumn
            key={member.name}
            theme={theme}
            member={member}
            enter={cols[i] as StaggeredItem}
            base={pCols.start + i * COL_STAGGER}
          />
        ))}
      </div>
    </SlideShell>
  );
};

const MemberColumn: React.FC<{
  theme: Theme;
  member: (typeof TEAM)[number];
  enter: StaggeredItem;
  /** Absolute frame at which this column starts entering (phase-2 derived). */
  base: number;
}> = ({ theme, member, enter, base }) => {
  const c = COLORS[theme];

  const bullets = useStaggeredFadeIn(member.bullets.length, {
    step: BULLET_STAGGER,
    startDelay: base + BULLETS_AFTER,
    translateY: 8,
    damping: 200,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: COL_WIDTH,
        opacity: enter.opacity,
        transform: enter.transform,
      }}
    >
      {/* Photo — circular, thin foreground-color border. */}
      <div
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: "50%",
          overflow: "hidden",
          border: `${AVATAR_BORDER}px solid ${c.WORD_COLOR_ON_BG_APPEARED}`,
          boxSizing: "content-box",
        }}
      >
        <Img
          src={staticFile(member.avatar)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>

      {/* Name — visible on column entry. */}
      <div
        style={{
          ...NAME_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          marginTop: 24,
        }}
      >
        {member.name}
      </div>

      {/* Majors — types in at LABEL_RATE after name lands. */}
      <div
        style={{
          ...MAJORS_STYLE,
          color: c.WORD_COLOR_ON_BG_GREYED,
          marginTop: 8,
        }}
      >
        <TypeOnText
          text={member.majors}
          rate={LABEL_RATE}
          delay={base + MAJORS_AFTER}
          caret={false}
        />
      </div>

      {/* Subtle divider — short horizontal line, draws left→right. */}
      <div style={{ marginTop: 20, marginBottom: 16 }}>
        <MotionLine
          x1={0}
          y1={0}
          x2={DIVIDER_WIDTH}
          y2={0}
          delay={base + DIVIDER_AFTER}
          durationInFrames={DIVIDER_FRAMES}
          color={c.WORD_COLOR_ON_BG_APPEARED}
          strokeWidth={2}
          svgWidth={DIVIDER_WIDTH}
          svgHeight={2}
        />
      </div>

      {/* Institutional chip — Miami M + institution label. */}
      <InstitutionChip theme={theme} delay={base + MIAMI_AFTER} />

      {/* Supporting bullets — staggered fade-in, left-aligned within column. */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "36px 0 0 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignSelf: "stretch",
        }}
      >
        {member.bullets.map((text, bi) => {
          const b = bullets[bi];
          return (
            <li
              key={text}
              style={{
                ...BULLET_STYLE,
                color: c.WORD_COLOR_ON_BG_APPEARED,
                opacity: b?.opacity ?? 0,
                transform: b?.transform ?? "none",
                display: "flex",
                alignItems: "baseline",
                gap: 12,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: c.WORD_COLOR_ON_BG_APPEARED,
                  flexShrink: 0,
                  transform: "translateY(-3px)",
                }}
              />
              <span style={{ flex: 1 }}>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Miami block-M + "Miami University" label — static institutional chrome. */
const InstitutionChip: React.FC<{ theme: Theme; delay: number }> = ({ theme, delay }) => {
  const c = COLORS[theme];
  const fade = useFadeIn({ translateY: 6, delay });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity: fade.opacity,
        transform: fade.transform,
      }}
    >
      <MiamiMark size={26} delay={delay} />
      <div style={{ ...INSTITUTION_LABEL_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
        Miami University
      </div>
    </div>
  );
};
