import React from "react";
import { AbsoluteFill } from "remotion";
import { REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import type { SlideBodyProps } from "./index";

/**
 * Placeholder intro slide. Slide-agent should replace the body with the
 * final design; the fade-in mechanics are fine to keep.
 */
export const IntroSlide: React.FC<SlideBodyProps> = ({ theme, meta }) => {
  const { opacity, transform } = useFadeIn({ translateY: 16 });

  const title = (meta?.title as string | undefined) ?? "Agentic AutoML Platform";
  const subtitle =
    (meta?.subtitle as string | undefined) ?? "CSE 449 · Capstone Deliverable";

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingInline: 96,
        color: COLORS[theme].WORD_COLOR_ON_BG_APPEARED,
        opacity,
        transform,
      }}
    >
      <div
        style={{
          ...TITLE_FONT,
          fontSize: 96,
          textAlign: "center",
          textWrap: "balance",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 36,
          marginTop: 24,
          color: COLORS[theme].WORD_COLOR_ON_BG_GREYED,
          textAlign: "center",
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  );
};
