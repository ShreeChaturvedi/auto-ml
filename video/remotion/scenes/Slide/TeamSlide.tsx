import React from "react";
import { Img, staticFile } from "remotion";
import { REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 4-phase budget (60fps). Sum = 840 = 14s.
 *   1.   0–30   eyebrow + heading
 *   2.  30–120  two member rows stagger in (avatar + name + role + bullets)
 *   3. 120–300  per-member bullet stagger
 *   4. 300–840  hold */
const PHASES = [30, 90, 180, 540] as const;
const ROW_STAGGER = 24;
const BULLET_STAGGER = 12;
/** Avatar diameter. */
const AVATAR_SIZE = 180;
/** Avatar border width in px — black ring around the circle. */
const AVATAR_BORDER = 3;
/** Horizontal gap between avatar and text column. */
const AVATAR_GAP = 56;
/** Vertical gap between the two member rows. */
const ROW_GAP = 72;

const TEAM = [
  {
    name: "Shree Chaturvedi",
    role: "PRODUCT ARCHITECT",
    avatar: "team/shree.jpeg",
    bullets: [
      "Designed the 6-phase workflow and the LangGraph state machine that drives it.",
      "Built the preprocessing FSM and the approval-gate UX across every phase.",
      "Owns the design system — shadcn/ui, Tailwind tokens, project-theme layer.",
    ],
  },
  {
    name: "Ayush Yadav",
    role: "LEAD ENGINEER",
    avatar: "team/ayush.jpeg",
    bullets: [
      "Built the Monaco + Jedi notebook runtime with live WebSocket sync.",
      "Stood up the Docker sandbox — read-only rootfs, non-root user, CPU / memory limits.",
      "Wrote the eval runner and the Optuna study streaming UI.",
    ],
  },
] as const;

type FourPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];
type TwoRows = [StaggeredItem, StaggeredItem];

const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 56,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  maxWidth: 1400,
};

const NAME_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 52,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
};

const ROLE_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 18,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  lineHeight: 1.2,
  marginTop: 10,
  minHeight: 22,
};

const BULLET_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 24,
  lineHeight: 1.5,
  letterSpacing: "-0.005em",
};

/**
 * TeamSlide — 14s (840f). Two engineers, side-by-side rows, avatar left /
 * text right. No card chrome — the slide breathes. Bigger type than the
 * prior card-treatment version; suitable for 1920 × 1080 projection.
 */
export const TeamSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const [, pRows] = useTimeline([...PHASES]) as FourPhases;
  const c = COLORS[theme];

  const rows = useStaggeredFadeIn(TEAM.length, {
    step: ROW_STAGGER,
    startDelay: pRows.start,
    translateY: 24,
    damping: 200,
  }) as TwoRows;

  const heading = useFadeIn({ translateY: 8, delay: 0 });

  return (
    <SlideShell theme={theme} eyebrow="BUILT BY" pageNumber="03 / 07">
      <div
        style={{
          ...HEADING_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: heading.opacity,
          transform: heading.transform,
          marginBottom: 64,
        }}
      >
        Two engineers, four sprints.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
        {TEAM.map((member, i) => (
          <MemberRow
            key={member.name}
            theme={theme}
            member={member}
            enter={rows[i] as StaggeredItem}
            index={i}
          />
        ))}
      </div>
    </SlideShell>
  );
};

const MemberRow: React.FC<{
  theme: Theme;
  member: (typeof TEAM)[number];
  enter: StaggeredItem;
  index: number;
}> = ({ theme, member, enter, index }) => {
  const c = COLORS[theme];
  // Phase-3 begins at frame 120; each row's internal reveal trails by
  // ROW_STAGGER so the cadence matches the row entry.
  const base = 120 + index * ROW_STAGGER;

  const bullets = useStaggeredFadeIn(member.bullets.length, {
    step: BULLET_STAGGER,
    startDelay: base + 60,
    translateY: 6,
    damping: 200,
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: AVATAR_GAP,
        opacity: enter.opacity,
        transform: enter.transform,
      }}
    >
      {/* Circular avatar with black border. */}
      <div
        style={{
          flexShrink: 0,
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

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...NAME_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
          {member.name}
        </div>

        <div style={{ ...ROLE_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
          <TypeOnText
            text={member.role}
            rate={LABEL_RATE}
            delay={base + 30}
            caret={false}
          />
        </div>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "24px 0 0 0",
            display: "flex",
            flexDirection: "column",
            gap: 10,
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
                  gap: 16,
                }}
              >
                <span
                  style={{
                    color: c.WORD_COLOR_ON_BG_GREYED,
                    lineHeight: 1.5,
                    flexShrink: 0,
                  }}
                >
                  —
                </span>
                <span style={{ flex: 1 }}>{text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
