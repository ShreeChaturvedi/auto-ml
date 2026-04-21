import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../config/easing";
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

/** 4-phase budget (60fps). Sum = 780 = 13s.
 *   1.   0–30   eyebrow + heading fade
 *   2.  30–120  two advisor columns stagger in
 *   3. 120–300  per-column bullet stagger
 *   4. 300–780  hold; warm amber glow eases in ~500 */
const PHASES = [30, 90, 180, 480] as const;
const COL_STAGGER = 24;
const BULLET_STAGGER = 12;

const AVATAR_SIZE = 180;
const AVATAR_BORDER = 3;

const COL_WIDTH = 620;
const COL_GAP = 96;

// Vertical spacing within an advisor column.
const AVATAR_TO_NAME = 24;
const NAME_TO_ROLE = 10;
const ROLE_TO_BULLETS = 28;
const BULLET_GAP = 10;

const GLOW_FADE_START = 500;
const GLOW_FADE_END = 620;
/** Warm amber wash — felt, not noticed. Intentionally not hoisted to theme
 *  palette because no other slide uses it. */
const WARM_GLOW_BACKGROUND =
  "radial-gradient(800px 400px at 50% 100%, rgba(235, 200, 150, 0.04), transparent)";

// Subtle 1-px vertical rule between the two advisor columns — same treatment
// as the TeamSlide column divider. Fades in once both columns are rising so
// the eye has structural scaffolding while content lands.
const COLUMN_DIVIDER_DELAY = 40;
const COLUMN_DIVIDER_PEAK_OPACITY = 0.16;

const ADVISORS = [
  {
    name: "Samer Y. Khamaiseh, Ph.D.",
    role: "PROJECT TECHNICAL ADVISOR",
    avatar: "team/samer.png",
    bullets: [
      "Pressed us to justify the LangGraph state machine over simpler chains.",
      "Challenged the scope of our sandboxing and eval coverage.",
      "Raised the bar for what 'working' meant in each review.",
    ],
  },
  {
    name: "Prof. Lynn Stahr, M.S.",
    role: "STEWARD OF THE CSE 449 CAPSTONE",
    avatar: "team/stahr.png",
    bullets: [
      "Set the sprint cadence and review gates that shaped our delivery.",
      "Read every draft and pushed our written communication sharper.",
      "Built the review panel that makes this presentation real work, not a dry run.",
    ],
  },
] as const;

type FourPhases = [PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo];
type TwoCols = [StaggeredItem, StaggeredItem];

const HEADING_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 56,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  maxWidth: 1400,
};

const NAME_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 40,
  letterSpacing: "-0.015em",
  lineHeight: 1.15,
  textAlign: "center",
};

const ROLE_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 16,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  lineHeight: 1.2,
  minHeight: 20,
  textAlign: "center",
};

const BULLET_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 20,
  lineHeight: 1.45,
  letterSpacing: "-0.005em",
};

/**
 * AcknowledgementsSlide — 13s (780f). Two advisors laid out side by side as
 * centered columns (avatar on top, name, role, bullets below), matching the
 * TeamSlide cadence. A subtle 1-px vertical rule divides the two columns and
 * a warm amber bottom glow gives the slide its institutional register.
 */
export const AcknowledgementsSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];
  const [, pCols] = useTimeline([...PHASES]) as FourPhases;

  const cols = useStaggeredFadeIn(ADVISORS.length, {
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

  const glowOpacity = interpolate(
    frame,
    [GLOW_FADE_START, GLOW_FADE_END],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <SlideShell theme={theme} eyebrow="WITH GRATITUDE" pageNumber="04">
      {/* Warm amber glow — first child so it sits behind text. AbsoluteFill
          ignores SlideShell's padding, letting the gradient bleed off-edge. */}
      <AbsoluteFill
        style={{
          backgroundImage: WARM_GLOW_BACKGROUND,
          opacity: glowOpacity,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          ...HEADING_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: heading.opacity,
          transform: heading.transform,
        }}
      >
        Two advisors who shaped this project.
      </div>

      {/* Fill the remaining vertical space and center the two-column block
          both vertically and horizontally so the advisors occupy the middle
          of the slide rather than hugging the heading. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Subtle column divider — 1-px vertical rule between the advisors. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "8%",
            bottom: "8%",
            left: "50%",
            width: 1,
            transform: "translateX(-0.5px)",
            background: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: columnDivider.opacity * COLUMN_DIVIDER_PEAK_OPACITY,
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "flex", gap: COL_GAP }}>
          {ADVISORS.map((advisor, i) => (
            <AdvisorColumn
              key={advisor.name}
              theme={theme}
              advisor={advisor}
              enter={cols[i] as StaggeredItem}
              index={i}
            />
          ))}
        </div>
      </div>
    </SlideShell>
  );
};

const AdvisorColumn: React.FC<{
  theme: Theme;
  advisor: (typeof ADVISORS)[number];
  enter: StaggeredItem;
  index: number;
}> = ({ theme, advisor, enter, index }) => {
  const c = COLORS[theme];
  // Phase-3 begins at frame 120.
  const base = 120 + index * COL_STAGGER;

  const bullets = useStaggeredFadeIn(advisor.bullets.length, {
    step: BULLET_STAGGER,
    startDelay: base + 60,
    translateY: 6,
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
      {/* Avatar: circular, thin foreground-color border. */}
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
          src={staticFile(advisor.avatar)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>

      {/* Name */}
      <div
        style={{
          ...NAME_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          marginTop: AVATAR_TO_NAME,
        }}
      >
        {advisor.name}
      </div>

      {/* Role: types in after the avatar + name land. */}
      <div
        style={{
          ...ROLE_STYLE,
          color: c.WORD_COLOR_ON_BG_GREYED,
          marginTop: NAME_TO_ROLE,
        }}
      >
        <TypeOnText
          text={advisor.role}
          rate={LABEL_RATE}
          delay={base + 30}
          caret={false}
        />
      </div>

      {/* Bullets: round-dot bullets (warmer tone than the TeamSlide 01/02/03
          monospace counter). */}
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
        {advisor.bullets.map((text, bi) => {
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
                gap: 14,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
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
