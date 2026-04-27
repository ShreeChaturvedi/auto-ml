import React from "react";
import { Img, staticFile } from "remotion";
import { MONOSPACE_FONT, REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { FlourishUnderline } from "../../primitives/FlourishUnderline";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

// -----------------------------------------------------------------------------
// Finance-deck cards (14s / 840f). Per column, top to bottom:
//
//   photo, name, major, divider, [company-logo role], bullets
//
// The divider separates the identity block (photo, name, major) from the
// working identity: the role sits on one inline row with its employer's
// mark on the left so job + employer read as a unit. Bullets use a Monaspace
// 01/02/03 counter for editorial structure; no ACCENT_COLOR is used anywhere
// on the slide, typography is the only differentiator.
//
// Six-phase budget. Each phase-end sets the next element's delay; per-column
// offsets (COL_STAGGER) stagger the second column behind the first so the
// slide reads left to right.
//
//   1.    0- 20   eyebrow + heading fade
//   2.   20- 70   both columns rise (photo + name visible)
//   3.   70-160   major types in
//   4.  160-200   subtle divider draws
//   5.  200-240   company-logo + role row fades in as one unit
//   6.  240-840   bullets stagger, then hold
// -----------------------------------------------------------------------------
const PHASES = [20, 50, 90, 40, 40, 600] as const;
type SixPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];
type TwoCols = [StaggeredItem, StaggeredItem];

const COL_STAGGER = 30;
const BULLET_STAGGER = 14;

const AVATAR_SIZE = 180;
const AVATAR_BORDER = 3;
const COL_WIDTH = 540;
const COL_GAP = 120;

const DIVIDER_WIDTH = 248;
const DIVIDER_HEIGHT = 18;

// Per-member flourish variants. Both are gentler re-shapings of the HookSlide
// canonical path (peak `y=5` vs the default `y=1`) so the squiggles read as
// hand-drawn accents rather than dramatic rhetorical flourishes. The loop
// position differs between the two so adjacent columns don't look stamped.
const FLOURISH_PATH_A =
  "M 0 14 C 22 15, 52 13, 80 14 " +
  "C 88 15, 92 13, 94 11 " +
  "C 96 7, 100 5, 103 8 " +
  "C 106 13, 102 15, 98 12 " +
  "C 94 10, 98 7, 104 10 " +
  "C 125 13, 165 15, 200 13";
const FLOURISH_PATH_B =
  "M 0 14 C 16 15, 40 12, 72 13 " +
  "C 108 14, 130 12, 135 13 " +
  "C 138 8, 142 5, 145 8 " +
  "C 148 13, 144 15, 140 12 " +
  "C 136 10, 140 7, 146 10 " +
  "C 165 14, 185 15, 200 13";
const FLOURISH_PATHS: readonly string[] = [FLOURISH_PATH_A, FLOURISH_PATH_B];

// Vertical column divider — a 1-px rule that fades in between the two team
// cards. Peak opacity is deliberately low so the divider reads as structural
// scaffolding, not a feature, against the near-black foreground color.
const COLUMN_DIVIDER_DELAY = 70;
const COLUMN_DIVIDER_PEAK_OPACITY = 0.16;

// Column-local frame offsets (added to each column's `base` frame).
const MAJORS_AFTER = 20;
const DIVIDER_AFTER = 120;
const ROLE_AFTER = 160;
const BULLETS_AFTER = 200;

// Vertical spacing within MemberColumn.
const AVATAR_TO_NAME = 20;
const NAME_TO_MAJOR = 10;
const MAJOR_TO_DIVIDER = 20;
const DIVIDER_TO_ROLE = 16;
const ROLE_TO_BULLETS = 28;
const BULLET_GAP = 14;
// Inline gap between the employer mark and the role label in the role row.
const ROLE_ROW_GAP = 12;

type Member = {
  name: string;
  role: string;
  /** Employer mark rendered immediately left of the role label. */
  company: { src: string; logoHeight: number };
  major: string;
  avatar: string;
  bullets: readonly string[];
};

const TEAM: readonly Member[] = [
  {
    name: "Shree Chaturvedi",
    role: "Strategy Consultant",
    // EBC wordmark: a landscape mark with internal "EAST BRIDGE CONSULTANCY"
    // text. 32 px keeps the internal wordmark just readable on screen while
    // the mark itself stays proportionate to the 16 px role label.
    company: { src: "branding/ebc.webp", logoHeight: 32 },
    major: "Computer Science, Mathematics",
    avatar: "team/shree.jpeg",
    bullets: [
      "Designed the 6-phase agentic workflow and the LangGraph state machine that drives it.",
      "Built the preprocessing FSM and the approval-gate UX across every phase.",
      "Built the UI system: shadcn/ui components, Tailwind theme tokens, project-theme hooks.",
    ],
  },
  {
    name: "Ayush Yadav",
    role: "Data Integration Intern",
    // Miami block-M mark only; no sibling label in this layout.
    company: { src: "branding/miami-m.svg", logoHeight: 24 },
    major: "Computer Science",
    avatar: "team/ayush.jpeg",
    bullets: [
      "Built the Monaco and Jedi notebook runtime with live WebSocket sync.",
      "Stood up the Docker sandbox: read-only rootfs, non-root user, CPU and memory limits.",
      "Wrote the eval runner and the Optuna study streaming UI.",
    ],
  },
];

// Matches the slide-header rhythm used by WhyNowSlide, AgendaSlide,
// ProblemTrioSlide, and AcknowledgementsSlide: 48 px, left-aligned, balanced
// wrap, marginTop 8 for optical alignment with the eyebrow + divider.
const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 48,
  letterSpacing: "-0.025em",
  lineHeight: 1.15,
  maxWidth: 1500,
  marginTop: 8,
  marginBottom: 48,
  textWrap: "balance",
};

const NAME_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontWeight: 700,
  fontSize: 40,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  textAlign: "center",
};

// Instrument Serif — editorial accent font used throughout the video. Reads
// optically smaller than Plus Jakarta Sans, so bump the size slightly and
// loosen tracking to restore presence.
const MAJORS_STYLE: React.CSSProperties = {
  ...SERIF_FONT,
  fontSize: 24,
  letterSpacing: "0.01em",
  lineHeight: 1.25,
  textAlign: "center",
  minHeight: 30,
};

// Shared with AcknowledgementsSlide (slide 04) so the two adjacent slides
// speak the same visual language. See AcknowledgementsSlide.tsx ROLE_STYLE.
const ROLE_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 16,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  lineHeight: 1.2,
  textAlign: "center",
  minHeight: 20,
};

const BULLET_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 20,
  lineHeight: 1.5,
  letterSpacing: "-0.005em",
};

// Monospace 01/02/03 counter; replaces a generic dot bullet. Tabular-nums
// keeps digits aligned across rows; the tiny negative Y aligns cap-heights
// against the 20 px body copy.
const BULLET_COUNTER_STYLE: React.CSSProperties = {
  ...MONOSPACE_FONT,
  fontWeight: 600,
  fontSize: 14,
  width: 28,
  textAlign: "right",
  flexShrink: 0,
  transform: "translateY(-1px)",
  fontVariantNumeric: "tabular-nums",
};

/**
 * TeamSlide is the team intro slide, 14s (840f). Two team members in a
 * finance-deck format: photo, name, major, short divider, role, company
 * wordmark, then monospace-numbered supporting bullets. The heading, photos,
 * names, and card chrome are identical per column; all differentiation is in
 * the content and the 30-frame column stagger.
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
  const columnDivider = useFadeIn({
    delay: COLUMN_DIVIDER_DELAY,
    damping: 200,
  });

  return (
    <SlideShell theme={theme} eyebrow="BUILT BY" pageNumber="03">
      <div
        style={{
          ...HEADING_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: heading.opacity,
          transform: heading.transform,
        }}
      >
        Engineering Team
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "center",
          gap: COL_GAP,
        }}
      >
        {/* Subtle 1-px vertical divider between the two cards. Fades in after
            both columns have risen but before the majors finish typing, so
            the eye has structural scaffolding once both identities are on
            screen. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            width: 1,
            transform: "translateX(-0.5px)",
            background: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: columnDivider.opacity * COLUMN_DIVIDER_PEAK_OPACITY,
            pointerEvents: "none",
          }}
        />
        {TEAM.map((member, i) => (
          <MemberColumn
            key={member.name}
            theme={theme}
            member={member}
            enter={cols[i] as StaggeredItem}
            base={pCols.start + i * COL_STAGGER}
            flourishPath={FLOURISH_PATHS[i] ?? FLOURISH_PATH_A}
          />
        ))}
      </div>
    </SlideShell>
  );
};

const MemberColumn: React.FC<{
  theme: Theme;
  member: Member;
  enter: StaggeredItem;
  /** Absolute frame at which this column starts entering (phase-2 derived). */
  base: number;
  /** SVG path data driving this column's flourish divider. Each column uses a
   *  distinct variant so adjacent squiggles don't look stamped from one mold. */
  flourishPath: string;
}> = ({ theme, member, enter, base, flourishPath }) => {
  const c = COLORS[theme];

  const bullets = useStaggeredFadeIn(member.bullets.length, {
    step: BULLET_STAGGER,
    startDelay: base + BULLETS_AFTER,
    translateY: 8,
    damping: 200,
  });

  // Short strings like "Strategy Consultant" read messy when typed; running
  // two overlapping typewriters on the same column (role + major) is visual
  // noise. The role uses a soft fade; the major keeps the TypeOnText reveal.
  const roleFade = useFadeIn({ translateY: 4, delay: base + ROLE_AFTER });

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
      {/* Photo: circular, thin foreground-color border. */}
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

      {/* Name: visible on column entry. */}
      <div
        style={{
          ...NAME_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          marginTop: AVATAR_TO_NAME,
        }}
      >
        {member.name}
      </div>

      {/* Major: types in at LABEL_RATE after the name lands. Rendered in
          the fully-appeared foreground color (black on the light theme) so
          the serif reads with editorial weight rather than secondary muted. */}
      <div
        style={{
          ...MAJORS_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          marginTop: NAME_TO_MAJOR,
        }}
      >
        <TypeOnText
          text={member.major}
          rate={LABEL_RATE}
          delay={base + MAJORS_AFTER}
          caret={false}
        />
      </div>

      {/* Hand-drawn squiggle divider — same draw-in flourish as the HookSlide
          "training models." underline. `drawOut={false}` so it holds through
          the slide's 14s runtime instead of retracting. */}
      <div
        style={{
          marginTop: MAJOR_TO_DIVIDER,
          marginBottom: DIVIDER_TO_ROLE,
          width: DIVIDER_WIDTH,
          height: DIVIDER_HEIGHT,
        }}
      >
        <FlourishUnderline
          delay={base + DIVIDER_AFTER}
          drawOut={false}
          width={DIVIDER_WIDTH}
          height={DIVIDER_HEIGHT}
          strokeWidth={2.5}
          path={flourishPath}
        />
      </div>

      {/* Role row: employer mark on the left, uppercase role label on the
          right. Fades in as one unit so the job and its employer read
          together. The <Img> renders without its own fade to avoid the
          opacity-multiplication bug that happens when a fading wrapper wraps
          an already-fading child. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: ROLE_ROW_GAP,
          opacity: roleFade.opacity,
          transform: roleFade.transform,
        }}
      >
        <Img
          src={staticFile(member.company.src)}
          style={{
            height: member.company.logoHeight,
            width: "auto",
            display: "block",
            flexShrink: 0,
          }}
        />
        <div style={{ ...ROLE_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
          {member.role}
        </div>
      </div>

      {/* Supporting bullets: monospace 01/02/03 counter + prose. */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: `${ROLE_TO_BULLETS}px 0 0 0`,
          display: "flex",
          flexDirection: "column",
          gap: BULLET_GAP,
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
                  ...BULLET_COUNTER_STYLE,
                  color: c.WORD_COLOR_ON_BG_GREYED,
                }}
              >
                {String(bi + 1).padStart(2, "0")}
              </span>
              <span style={{ flex: 1 }}>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
