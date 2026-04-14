import React from "react";
import { REGULAR_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import { COLORS } from "../../../config/themes";
import { AnimatedLogoMark } from "../../primitives/AnimatedLogoMark";
import { MaskReveal } from "../../primitives/MaskReveal";
import { MiamiMark } from "../../primitives/MiamiMark";
import { MotionLine } from "../../primitives/MotionLine";
import { ScaleInNumber } from "../../primitives/ScaleInNumber";
import { SlideShell } from "../../primitives/SlideShell";
import { READING_RATE, TypeOnText } from "../../primitives/TypeOnText";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/**
 * THROWAWAY — deleted in Commit 10 (dispatcher-integration commit).
 *
 * Exercises every primitive on a single canvas so Remotion Studio can smoke
 * test. Not polished; not fit for the production runway.
 */
export const SandboxSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const phases = useTimeline([30, 30, 30, 30, 30, 30]);
  const cards = useStaggeredFadeIn(3, {
    step: 18,
    startDelay: phases[3]?.start ?? 90,
    translateY: 20,
  });
  const c = COLORS[theme];

  return (
    <SlideShell theme={theme} eyebrow="SANDBOX · PRIMITIVES DEMO" spine>
      <div style={{ display: "flex", gap: 64, marginTop: 32 }}>
        {/* Left column: logo marks */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 48,
            alignItems: "flex-start",
          }}
        >
          <AnimatedLogoMark
            theme={theme}
            size={128}
            delay={phases[0]?.start ?? 0}
            mode="draw"
          />
          <MiamiMark size={60} delay={phases[1]?.start ?? 30} />
        </div>

        {/* Middle: type + scale-in number */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 32,
          }}
        >
          <TypeOnText
            text="Primitives compose the runway."
            rate={READING_RATE}
            delay={phases[2]?.start ?? 60}
            style={{
              ...REGULAR_FONT,
              fontSize: 32,
              color: c.WORD_COLOR_ON_BG_APPEARED,
            }}
          />
          <div
            style={{
              ...TITLE_FONT,
              fontSize: 120,
              color: c.ACCENT_COLOR,
              lineHeight: 1,
            }}
          >
            <ScaleInNumber value="42%" delay={phases[4]?.start ?? 120} />
          </div>
        </div>

        {/* Right: staggered cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cards.map((s, i) => (
            <div
              key={i}
              style={{
                opacity: s.opacity,
                transform: s.transform,
                padding: "12px 20px",
                border: `1px solid ${c.BORDER_COLOR}`,
                borderRadius: 12,
                background: c.BACKGROUND_ELEVATED,
                color: c.WORD_COLOR_ON_BG_APPEARED,
                ...REGULAR_FONT,
                fontSize: 20,
                minWidth: 220,
              }}
            >
              Card {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* MaskReveal heading */}
      <div style={{ marginTop: 56 }}>
        <MaskReveal delay={phases[5]?.start ?? 150} durationInFrames={48}>
          <div
            style={{
              ...SERIF_FONT,
              fontSize: 72,
              color: c.WORD_COLOR_ON_BG_APPEARED,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
            }}
          >
            Mask reveal demo
          </div>
        </MaskReveal>
      </div>

      {/* MotionLine horizontal rule */}
      <div style={{ marginTop: 32 }}>
        <MotionLine
          x1={0}
          y1={0}
          x2={800}
          y2={0}
          delay={phases[5]?.start ?? 150}
          durationInFrames={48}
          strokeWidth={1}
          color={c.BORDER_COLOR}
          svgWidth={800}
          svgHeight={2}
        />
      </div>
    </SlideShell>
  );
};
