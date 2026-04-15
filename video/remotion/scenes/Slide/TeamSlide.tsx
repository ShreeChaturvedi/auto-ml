import React from "react";
import { Img, staticFile } from "remotion";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { BrandChip } from "../../primitives/BrandChip";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

// -----------------------------------------------------------------------------
// Finance-deck cards (14s / 840f). Per column, top → bottom:
//
//   photo → name → role → company chip → divider → major → school chip → bullets
//
// The divider separates the professional identity (role + company) from the
// academic identity (major + school). Bullets use a Monaspace numeric counter
// (01, 02, 03) for editorial structure; no ACCENT_COLOR is used anywhere on
// the slide, typography is the only differentiator.
//
// Six-phase budget. Each phase-end sets the next element's `delay`; per-column
// offsets (`COL_STAGGER`) stagger the second column behind the first so the
// slide reads left→right.
//
//   1.    0– 20   eyebrow + heading fade
//   2.   20– 70   both columns rise (photo + name visible)
//   3.   70–160   role fades, company chip fades, major types in
//   4.  160–200   subtle divider draws + school chip fades
//   5.  200–350   per-column bullets stagger-fade with monospace counters
//   6.  350–840   hold
// -----------------------------------------------------------------------------
const PHASES = [20, 50, 90, 40, 150, 490] as const;
type SixPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];
type TwoCols = [StaggeredItem, StaggeredItem];

const COL_STAGGER = 30;
const BULLET_STAGGER = 14;

const AVATAR_SIZE = 180;
const AVATAR_BORDER = 3;
const COL_WIDTH = 540;
const COL_GAP = 120;

const DIVIDER_WIDTH = 72;
const DIVIDER_FRAMES = 28;

// Column-local frame offsets (added to each column's `base` frame).
const ROLE_AFTER = 30;
const CHIP_AFTER = 55;
const MAJORS_AFTER = 80;
const DIVIDER_AFTER = 135;
const SCHOOL_AFTER = 160;
const BULLETS_AFTER = 195;

// Vertical spacing within MemberColumn. Every value is part of the ~654 px
// column-height budget (1080 − 96 top − 120 bottom − 78 chrome − 132 heading
// block). Shree's column is the worst case because the EBC wordmark renders
// at 48 px, the sums below land exactly on budget.
const AVATAR_TO_NAME = 20;
const NAME_TO_ROLE = 6;
const ROLE_TO_COMPANY = 6;
const COMPANY_TO_DIVIDER = 20;
const DIVIDER_TO_MAJOR = 16;
const MAJOR_TO_SCHOOL = 6;
const SCHOOL_TO_BULLETS = 20;
const BULLET_GAP = 14;

type Member = {
  name: string;
  role: string;
  company: { src: string; logoHeight: number; label?: string };
  major: string;
  school: { src: string; logoHeight: number; label: string };
  avatar: string;
  bullets: readonly string[];
};

/** Shared Miami chip spec, rendered as company for Ayush and as school for both. */
const MIAMI_CHIP = {
  src: "branding/miami-m.svg",
  logoHeight: 26,
  label: "Miami University",
} as const;

const TEAM: readonly Member[] = [
  {
    name: "Shree Chaturvedi",
    role: "Strategy Consultant",
    // EBC is a self-labeled wordmark, the asset already contains the company
    // name, so pairing it with a sibling label would duplicate it. Render at
    // 48 px (vs. Miami's 26 px) so the inline "EAST BRIDGE CONSULTANCY"
    // wordmark stays readable.
    company: { src: "branding/ebc.webp", logoHeight: 48 },
    major: "Computer Science, Mathematics",
    school: MIAMI_CHIP,
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
    // Ayush interns where he studies (honest), and keeps the two columns
    // visually symmetric (both render a chip above and below the divider).
    company: MIAMI_CHIP,
    major: "Computer Science",
    school: MIAMI_CHIP,
    avatar: "team/ayush.jpeg",
    bullets: [
      "Built the Monaco and Jedi notebook runtime with live WebSocket sync.",
      "Stood up the Docker sandbox: read-only rootfs, non-root user, CPU and memory limits.",
      "Wrote the eval runner and the Optuna study streaming UI.",
    ],
  },
];

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

/** Shared with AcknowledgementsSlide (slide 04) so the two adjacent slides
 *  speak the same visual language. See AcknowledgementsSlide.tsx ROLE_STYLE. */
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

const MAJORS_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 20,
  letterSpacing: "0.005em",
  lineHeight: 1.3,
  textAlign: "center",
  minHeight: 26,
};

const BULLET_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 20,
  lineHeight: 1.5,
  letterSpacing: "-0.005em",
};

/** Monospace 01/02/03 counter; replaces the generic dot bullet. Tabular-nums
 *  keeps digits aligned across rows; the tiny negative Y aligns cap-heights
 *  against the 20 px body copy. */
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
 * TeamSlide is the "built by" slide, 14s (840f). Two engineers in a finance-deck
 * format: photo, name, role, company chip, short divider, major, school chip,
 * then monospace-numbered supporting bullets. The heading, photos, names, and
 * card chrome are identical per column; all differentiation is in the content
 * and the 30-frame column stagger.
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
  member: Member;
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

      {/* Role: uppercase micro-label, same styling as AcknowledgementsSlide. */}
      <div
        style={{
          ...ROLE_STYLE,
          color: c.WORD_COLOR_ON_BG_GREYED,
          marginTop: NAME_TO_ROLE,
          opacity: roleFade.opacity,
          transform: roleFade.transform,
        }}
      >
        {member.role}
      </div>

      {/* Company chip: EBC wordmark for Shree, Miami letter-mark + label for Ayush. */}
      <div style={{ marginTop: ROLE_TO_COMPANY }}>
        <BrandChip
          theme={theme}
          delay={base + CHIP_AFTER}
          src={member.company.src}
          logoHeight={member.company.logoHeight}
          label={member.company.label}
        />
      </div>

      {/* Subtle divider: separates professional (above) from academic (below). */}
      <div style={{ marginTop: COMPANY_TO_DIVIDER, marginBottom: DIVIDER_TO_MAJOR }}>
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

      {/* Major: types in at LABEL_RATE; long strings like
          "Computer Science, Mathematics" read beautifully at 3f/char. */}
      <div
        style={{
          ...MAJORS_STYLE,
          color: c.WORD_COLOR_ON_BG_GREYED,
        }}
      >
        <TypeOnText
          text={member.major}
          rate={LABEL_RATE}
          delay={base + MAJORS_AFTER}
          caret={false}
        />
      </div>

      {/* School chip: Miami M + "Miami University" for both members. */}
      <div style={{ marginTop: MAJOR_TO_SCHOOL }}>
        <BrandChip
          theme={theme}
          delay={base + SCHOOL_AFTER}
          src={member.school.src}
          logoHeight={member.school.logoHeight}
          label={member.school.label}
        />
      </div>

      {/* Supporting bullets: monospace 01/02/03 counter + prose. */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: `${SCHOOL_TO_BULLETS}px 0 0 0`,
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
