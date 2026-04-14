import React from "react";
import { AbsoluteFill } from "remotion";
import { REGULAR_FONT, SERIF_FONT } from "../../../config/fonts";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import type { SlideBodyProps } from "./index";

/** Placeholder problem statement slide — slide-agent will refine content. */
export const ProblemSlide: React.FC<SlideBodyProps> = ({ theme, meta }) => {
  const { opacity } = useFadeIn();

  const statement =
    (meta?.statement as string | undefined) ??
    "Data-science workflows are fragmented. Upload, explore, clean, feature-engineer, train — each step lives in a different tool with a different language.";

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingInline: 120,
        color: COLORS[theme].WORD_COLOR_ON_BG_APPEARED,
        opacity,
      }}
    >
      <div
        style={{
          ...SERIF_FONT,
          fontSize: 64,
          lineHeight: 1.15,
          maxWidth: 1400,
          textAlign: "center",
          textWrap: "balance",
          letterSpacing: "-0.01em",
        }}
      >
        {statement}
      </div>
      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 28,
          marginTop: 48,
          color: COLORS[theme].WORD_COLOR_ON_BG_GREYED,
        }}
      >
        What if one agentic platform handled the whole pipeline?
      </div>
    </AbsoluteFill>
  );
};
