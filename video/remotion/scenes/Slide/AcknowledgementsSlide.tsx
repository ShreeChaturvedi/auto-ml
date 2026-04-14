import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../config/easing";
import { REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import { SAFE_AREA } from "../../../config/layout";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { MiamiMark } from "../../primitives/MiamiMark";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { StaggeredItem } from "../../primitives/useStaggeredFadeIn";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/** 4-phase budget (60fps). Sum = 780 = 13s.
 *   1.   0–30   eyebrow + heading fade
 *   2.  30–120  two advisor rows stagger in
 *   3. 120–300  per-row bullet stagger
 *   4. 300–780  hold; Miami M fades in @ 300; warm amber glow eases in ~500 */
const PHASES = [30, 90, 180, 480] as const;
const ROW_STAGGER = 24;
const BULLET_STAGGER = 12;
const AVATAR_SIZE = 180;
const AVATAR_BORDER = 3;
const AVATAR_GAP = 56;
const ROW_GAP = 72;

const MIAMI_DELAY = 300;
const MIAMI_SIZE = 56;

const GLOW_FADE_START = 500;
const GLOW_FADE_END = 620;
/** Warm amber wash — felt, not noticed. Intentionally not hoisted to theme
 *  palette because no other slide uses it. */
const WARM_GLOW_BACKGROUND =
  "radial-gradient(800px 400px at 50% 100%, rgba(235, 200, 150, 0.04), transparent)";

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
  fontSize: 44,
  letterSpacing: "-0.015em",
  lineHeight: 1.15,
};

const ROLE_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 16,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  lineHeight: 1.2,
  marginTop: 10,
  minHeight: 20,
};

const BULLET_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 500,
  fontSize: 22,
  lineHeight: 1.5,
  letterSpacing: "-0.005em",
};

/**
 * AcknowledgementsSlide — 13s (780f). Same layout as TeamSlide (avatar left,
 * name + role + bullets right; no card chrome). Warm amber bottom glow and
 * a larger Miami block-M anchor give the slide its institutional register.
 */
export const AcknowledgementsSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];
  const [, pRows] = useTimeline([...PHASES]) as FourPhases;

  const rows = useStaggeredFadeIn(ADVISORS.length, {
    step: ROW_STAGGER,
    startDelay: pRows.start,
    translateY: 24,
    damping: 200,
  }) as TwoRows;

  const heading = useFadeIn({ translateY: 8, delay: 0 });

  const glowOpacity = interpolate(
    frame,
    [GLOW_FADE_START, GLOW_FADE_END],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <SlideShell theme={theme} eyebrow="WITH GRATITUDE" pageNumber="06 / 07">
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
          marginBottom: 56,
        }}
      >
        Two advisors who shaped this project.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
        {ADVISORS.map((advisor, i) => (
          <AdvisorRow
            key={advisor.name}
            theme={theme}
            advisor={advisor}
            enter={rows[i] as StaggeredItem}
            index={i}
          />
        ))}
      </div>

      {/* Miami block-M institutional anchor, bottom-center, above footer. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: SAFE_AREA.bottom + 40,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <MiamiMark size={MIAMI_SIZE} delay={MIAMI_DELAY} />
      </div>
    </SlideShell>
  );
};

const AdvisorRow: React.FC<{
  theme: Theme;
  advisor: (typeof ADVISORS)[number];
  enter: StaggeredItem;
  index: number;
}> = ({ theme, advisor, enter, index }) => {
  const c = COLORS[theme];
  // Phase-3 begins at frame 120.
  const base = 120 + index * ROW_STAGGER;

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
          src={staticFile(advisor.avatar)}
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
          {advisor.name}
        </div>

        <div style={{ ...ROLE_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
          <TypeOnText
            text={advisor.role}
            rate={LABEL_RATE}
            delay={base + 30}
            caret={false}
          />
        </div>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "20px 0 0 0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
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
