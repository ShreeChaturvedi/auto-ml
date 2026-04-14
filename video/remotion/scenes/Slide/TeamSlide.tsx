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
import type { SlideBodyProps } from "./index";

// -----------------------------------------------------------------------------
// Timing (60fps). Total slide 14s / 840f.
//
// Per-row reveal order (makes sense as a reading order):
//   1. row fades in       — avatar + name visible (the row's opacity carries it)
//   2. role types in      — Plus Jakarta 600 uppercase, LABEL_RATE (3f/char)
//   3. bullets fade in    — after the role finishes typing; 10f stagger between
//
// Row 1 trails row 0 by ROW_STAGGER so the cadence is rhythmic.
// -----------------------------------------------------------------------------
const ROW_START_BASE = 30;
const ROW_STAGGER = 36;
const ROLE_AFTER_ROW = 30;
/** Longest role "PRODUCT ARCHITECT" is 17 chars × LABEL_RATE (3f) = 51f.
 *  Give bullets a small breath after typing completes. */
const BULLETS_AFTER_ROLE = 55;
const BULLET_STAGGER = 10;

const AVATAR_SIZE = 180;
const AVATAR_BORDER = 3;
const AVATAR_GAP = 56;
const ROW_GAP = 80;

const TEAM = [
  {
    name: "Shree Chaturvedi",
    role: "PRODUCT ARCHITECT",
    avatar: "team/shree.jpeg",
    bullets: [
      "Designed the 6-phase workflow and the LangGraph state machine that drives it.",
      "Built the preprocessing FSM and the approval-gate UX across every phase.",
      "Built the UI system — shadcn/ui components, Tailwind theme tokens, project-theme hooks.",
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

const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 88,
  letterSpacing: "-0.025em",
  lineHeight: 1.05,
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
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  lineHeight: 1.2,
  marginTop: 12,
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
 * TeamSlide — 14s (840f). Two engineers, stacked rows, avatar left / text
 * right. No card chrome. Reveal order: name+avatar → role types → bullets
 * stagger after role completes.
 */
export const TeamSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const c = COLORS[theme];

  const rows = useStaggeredFadeIn(TEAM.length, {
    step: ROW_STAGGER,
    startDelay: ROW_START_BASE,
    translateY: 24,
    damping: 200,
  });

  const heading = useFadeIn({ translateY: 8, delay: 0 });

  return (
    <SlideShell theme={theme} eyebrow="BUILT BY" pageNumber="03 / 07">
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

      <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
        {TEAM.map((member, i) => (
          <MemberRow
            key={member.name}
            theme={theme}
            member={member}
            enter={rows[i] as StaggeredItem}
            rowStart={ROW_START_BASE + i * ROW_STAGGER}
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
  rowStart: number;
}> = ({ theme, member, enter, rowStart }) => {
  const c = COLORS[theme];
  const roleDelay = rowStart + ROLE_AFTER_ROW;
  const bulletStart = roleDelay + BULLETS_AFTER_ROLE;

  const bullets = useStaggeredFadeIn(member.bullets.length, {
    step: BULLET_STAGGER,
    startDelay: bulletStart,
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
            delay={roleDelay}
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
            gap: 12,
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
                  gap: 18,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: c.WORD_COLOR_ON_BG_APPEARED,
                    flexShrink: 0,
                    transform: "translateY(-4px)",
                  }}
                />
                <span style={{ flex: 1 }}>{text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
