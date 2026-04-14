import React from "react";
import { REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { MotionLine } from "../../primitives/MotionLine";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 4-phase frame budget (60fps). Sum = 840 = 14s.
 *   1. 0–20    eyebrow + serif heading
 *   2. 20–80   two cards rise with 15f stagger
 *   3. 80–160  per-card reveals (name, hairline, role, supporting)
 *   4. 160–840 hold */
const PHASES = [20, 60, 80, 680] as const;

const CARD_STAGGER = 15;
const CARD_MIN_WIDTH = 480;
const CARD_GAP = 48;
const CARD_PADDING = 36;
const CARD_RADIUS = 8;
/** Matches app `shadow-sm` (light-mode card.tsx). */
const CARD_SHADOW = "0 2px 12px rgba(0, 0, 0, 0.04)";

const HAIRLINE_WIDTH = 32;
const HAIRLINE_DRAW_FRAMES = 24;

/** Per-card beat offsets from phase-3 start (frame 80) + stagger·index.
 *  Name → +0, hairline → +20, role → +40, bio → +80 (40f after role starts). */
const BEAT = { name: 0, hairline: 20, role: 40, bio: 80 } as const;

const TEAM = [
  {
    name: "Shree Chaturvedi",
    role: "PRODUCT ARCHITECT",
    bio: "Led the agentic orchestration layer, preprocessing FSM, and UI system.",
  },
  {
    name: "Ayush Yadav",
    role: "LEAD ENGINEER",
    bio: "Built the notebook runtime, sandbox execution, and evaluation pipeline.",
  },
] as const;

type FourPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];
type TwoCards = [StaggeredItem, StaggeredItem];

const HEADING_STYLE: React.CSSProperties = {
  ...SERIF_FONT,
  fontSize: 40,
  letterSpacing: "0em",
  lineHeight: 1.25,
  maxWidth: 1200,
  textWrap: "balance",
};
const NAME_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 36,
  lineHeight: 1.15,
  letterSpacing: "-0.01em",
};
const ROLE_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 14,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  opacity: 0.85,
  lineHeight: 1.2,
  minHeight: 18,
};
const BIO_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontSize: 18,
  lineHeight: 1.45,
  marginTop: 16,
};
const CARDS_ROW_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "55%",
  left: 0,
  right: 0,
  transform: "translateY(-50%)",
  display: "flex",
  gap: CARD_GAP,
  justifyContent: "center",
  alignItems: "flex-start",
  paddingInline: 96,
};

/**
 * TeamSlide — 14s (840f) credits slide. Names fade in (never typewriter),
 * role eyebrows type at LABEL_RATE in Plus Jakarta 600 uppercase (not
 * monospace), and a 32px animated hairline separates name from role inside
 * each app-treatment card.
 */
export const TeamSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const [, pCards] = useTimeline([...PHASES]) as FourPhases;
  const c = COLORS[theme];

  const cards = useStaggeredFadeIn(TEAM.length, {
    step: CARD_STAGGER,
    startDelay: pCards.start,
    translateY: 24,
    damping: 200,
  }) as TwoCards;

  const heading = useFadeIn({ translateY: 8, delay: 0 });

  return (
    <SlideShell theme={theme} eyebrow="BUILT BY">
      {/* Phase 1 — serif heading. */}
      <div
        style={{
          ...HEADING_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: heading.opacity,
          transform: heading.transform,
        }}
      >
        Shipped by two engineers across four sprints.
      </div>

      {/* Phases 2–3 — two member cards, centered around ~55% vertical. */}
      <div style={CARDS_ROW_STYLE}>
        {TEAM.map((member, i) => (
          <MemberCard
            key={member.name}
            theme={theme}
            member={member}
            enter={cards[i] as StaggeredItem}
            index={i}
          />
        ))}
      </div>
    </SlideShell>
  );
};

/** Per-member card. Name fades (NOT TypeOnText — letter-by-letter feels like
 *  a chyron flash on short strings); hairline animates; role types; bio fades. */
const MemberCard: React.FC<{
  theme: Theme;
  member: (typeof TEAM)[number];
  enter: StaggeredItem;
  index: number;
}> = ({ theme, member, enter, index }) => {
  const c = COLORS[theme];
  // Phase-3 begins at frame 80; each card's internal reveal trails by CARD_STAGGER
  // so the cadence matches the entry stagger.
  const base = 80 + index * CARD_STAGGER;
  const name = useFadeIn({ translateY: 8, delay: base + BEAT.name });
  const bio = useFadeIn({ translateY: 6, delay: base + BEAT.bio });

  return (
    <div
      style={{
        minWidth: CARD_MIN_WIDTH,
        maxWidth: CARD_MIN_WIDTH,
        padding: CARD_PADDING,
        borderRadius: CARD_RADIUS,
        background: c.BACKGROUND_ELEVATED,
        border: `1px solid ${c.BORDER_COLOR}`,
        boxShadow: CARD_SHADOW,
        opacity: enter.opacity,
        transform: enter.transform,
      }}
    >
      <div
        style={{
          ...NAME_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: name.opacity,
          transform: name.transform,
        }}
      >
        {member.name}
      </div>

      <div style={{ marginTop: 20, marginBottom: 20 }}>
        <MotionLine
          x1={0}
          y1={0}
          x2={HAIRLINE_WIDTH}
          y2={0}
          delay={base + BEAT.hairline}
          durationInFrames={HAIRLINE_DRAW_FRAMES}
          color={c.BORDER_COLOR}
          svgWidth={HAIRLINE_WIDTH}
          svgHeight={2}
        />
      </div>

      {/* Role eyebrow — Plus Jakarta 600 uppercase tracking-wider, typed at
          LABEL_RATE. Not `EyebrowLabel`: we want the typewriter to own the
          motion, not a second fade stacked on top. */}
      <div style={{ ...ROLE_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
        <TypeOnText
          text={member.role}
          rate={LABEL_RATE}
          delay={base + BEAT.role}
          caret={false}
        />
      </div>

      <div
        style={{
          ...BIO_STYLE,
          color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: bio.opacity,
          transform: bio.transform,
        }}
      >
        {member.bio}
      </div>
    </div>
  );
};
