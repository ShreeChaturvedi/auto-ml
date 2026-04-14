import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../config/easing";
import { REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import { SAFE_AREA } from "../../../config/layout";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { MaskReveal } from "../../primitives/MaskReveal";
import { MiamiMark } from "../../primitives/MiamiMark";
import { SlideShell } from "../../primitives/SlideShell";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import type { SlideBodyProps } from "./index";

/** 6-phase frame budget (60fps). Sum = 780 = 13s.
 *   1. 0–20    eyebrow fade (SlideShell)
 *   2. 20–100  heading reveals via MaskReveal (80f sweep, EASE_OUT)
 *   3. 100–160 left block: name (100) → role typed (120) → thanks-line (140)
 *   4. 160–220 right block — same sequence, 60f offset
 *   5. 220–340 Miami block-M fades in (20f reveal inside MiamiMark) + holds
 *   6. 340–780 hold; warm amber bottom glow eases in starting ~500f */
const HEADING_DELAY = 20;
const HEADING_DURATION = 80;

const LEFT_NAME_DELAY = 100;
const LEFT_ROLE_DELAY = 120;
const LEFT_THANKS_DELAY = 140;
const BLOCK_OFFSET = 60;

const MIAMI_DELAY = 220;
const MIAMI_SIZE = 48;

const GLOW_FADE_START = 500;
const GLOW_FADE_END = 600;
/** One-off warm amber wash — rgba(235, 200, 150, 0.03). Emotional warmth for
 *  the academic thanks; intentionally not hoisted to theme palette because no
 *  other slide uses it. Felt, not noticed. */
const WARM_GLOW_BACKGROUND =
  "radial-gradient(800px 400px at 50% 100%, rgba(235, 200, 150, 0.03), transparent)";

type Acknowledgement = { name: string; role: string; thanks: string };

const LEFT_ACK: Acknowledgement = {
  name: "Samer Y. Khamaiseh, Ph.D.",
  role: "PROJECT TECHNICAL ADVISOR",
  thanks:
    "Who kept our architecture honest and our reasoning deeper than it wanted to be.",
};

const RIGHT_ACK: Acknowledgement = {
  name: "Prof. Lynn Stahr, M.S.",
  role: "STEWARD OF THE CSE 449 CAPSTONE",
  thanks: "Whose structure, care, and rigor turned a class into a launch pad.",
};

const BLOCK_WIDTH = 650;

const HEADING_STYLE: React.CSSProperties = {
  ...SERIF_FONT,
  fontSize: 56,
  letterSpacing: "0em",
  lineHeight: 1.22,
  maxWidth: 1400,
  textAlign: "center",
  textWrap: "balance",
  margin: "0 auto",
};
const NAME_STYLE: React.CSSProperties = {
  ...TITLE_FONT,
  fontSize: 32,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
};
const ROLE_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 14,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  lineHeight: 1.2,
  minHeight: 18,
  marginTop: 10,
};
const THANKS_STYLE: React.CSSProperties = {
  ...SERIF_FONT,
  fontSize: 22,
  fontStyle: "italic",
  lineHeight: 1.5,
  letterSpacing: "0em",
  marginTop: 14,
};
const BLOCKS_ROW_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "58%",
  left: 0,
  right: 0,
  transform: "translateY(-50%)",
  display: "flex",
  gap: 48,
  justifyContent: "center",
  alignItems: "flex-start",
  paddingInline: 96,
};
const MIAMI_WRAP_STYLE: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: SAFE_AREA.bottom + 24,
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
};

/**
 * AcknowledgementsSlide — faculty acknowledgement with institutional warmth
 * (13s / 780f).
 *
 * Editorial register: serif mask-sweep heading + two horizontal thank-you
 * blocks + Miami block-M institutional anchor + a very subtle warm-amber
 * bottom glow that eases in near the end of the hold. No product accent.
 */
export const AcknowledgementsSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const c = COLORS[theme];

  // Phase 6 — warm amber glow fades in 500f → 600f.
  const glowOpacity = interpolate(
    frame,
    [GLOW_FADE_START, GLOW_FADE_END],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <SlideShell theme={theme} eyebrow="WITH GRATITUDE" pageNumber="06 / 07">
      {/* Warm amber glow — first child so it sits behind text. `AbsoluteFill`
          ignores SlideShell's padding, letting the gradient bleed off-edge. */}
      <AbsoluteFill
        style={{
          backgroundImage: WARM_GLOW_BACKGROUND,
          opacity: glowOpacity,
          pointerEvents: "none",
        }}
      />

      {/* Phase 2 — heading reveals via 80f mask sweep. */}
      <MaskReveal
        delay={HEADING_DELAY}
        durationInFrames={HEADING_DURATION}
        style={{ marginTop: 24, color: c.WORD_COLOR_ON_BG_APPEARED }}
      >
        <div style={HEADING_STYLE}>
          Guided, challenged, and sharpened by two mentors we are grateful for.
        </div>
      </MaskReveal>

      {/* Phases 3–4 — two horizontal acknowledgement blocks. */}
      <div style={BLOCKS_ROW_STYLE}>
        <AcknowledgementCard
          theme={theme}
          data={LEFT_ACK}
          nameDelay={LEFT_NAME_DELAY}
          roleDelay={LEFT_ROLE_DELAY}
          thanksDelay={LEFT_THANKS_DELAY}
        />
        <AcknowledgementCard
          theme={theme}
          data={RIGHT_ACK}
          nameDelay={LEFT_NAME_DELAY + BLOCK_OFFSET}
          roleDelay={LEFT_ROLE_DELAY + BLOCK_OFFSET}
          thanksDelay={LEFT_THANKS_DELAY + BLOCK_OFFSET}
        />
      </div>

      {/* Phase 5 — Miami block-M institutional anchor, bottom-center. */}
      <div style={MIAMI_WRAP_STYLE}>
        <MiamiMark size={MIAMI_SIZE} delay={MIAMI_DELAY} />
      </div>
    </SlideShell>
  );
};

/** One acknowledgement block: name fades, role types at LABEL_RATE, and the
 *  italic thanks-line fades in just after. Italic uses Instrument Serif 400's
 *  explicit italic variant, loaded in `config/fonts.ts`. */
const AcknowledgementCard: React.FC<{
  theme: Theme;
  data: Acknowledgement;
  nameDelay: number;
  roleDelay: number;
  thanksDelay: number;
}> = ({ theme, data, nameDelay, roleDelay, thanksDelay }) => {
  const c = COLORS[theme];
  const name = useFadeIn({ translateY: 8, delay: nameDelay });
  const thanks = useFadeIn({ translateY: 6, delay: thanksDelay });

  return (
    <div style={{ width: BLOCK_WIDTH }}>
      <div
        style={{
          ...NAME_STYLE,
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: name.opacity,
          transform: name.transform,
        }}
      >
        {data.name}
      </div>
      <div style={{ ...ROLE_STYLE, color: c.WORD_COLOR_ON_BG_GREYED }}>
        <TypeOnText
          text={data.role}
          rate={LABEL_RATE}
          delay={roleDelay}
          caret={false}
        />
      </div>
      <div
        style={{
          ...THANKS_STYLE,
          color: c.WORD_COLOR_ON_BG_GREYED,
          opacity: thanks.opacity,
          transform: thanks.transform,
        }}
      >
        {data.thanks}
      </div>
    </div>
  );
};
