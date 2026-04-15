import React from "react";
import { AbsoluteFill } from "remotion";
import { REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { SceneVoiceover } from "../../helpers/SceneVoiceover";
import { useFadeIn } from "../../helpers/useFadeIn";

export const Title: React.FC<{
  title: string;
  subtitle: string | null;
  theme: Theme;
  voiceoverFile?: string;
}> = ({ subtitle, title, theme, voiceoverFile }) => {
  const { opacity, transform } = useFadeIn({ translateY: 20 });

  return (
    <AbsoluteFill
      style={{
        background: COLORS[theme].BACKGROUND,
        justifyContent: "center",
        alignItems: "center",
        paddingInline: 96,
        opacity,
        transform,
      }}
    >
      <div
        style={{
          ...TITLE_FONT,
          fontSize: 80,
          color: COLORS[theme].WORD_COLOR_ON_BG_APPEARED,
          textAlign: "center",
          textWrap: "balance",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </div>
      {subtitle && subtitle.trim() !== "" ? (
        <div
          style={{
            ...REGULAR_FONT,
            fontSize: 36,
            marginTop: 20,
            color: COLORS[theme].WORD_COLOR_ON_BG_GREYED,
            textAlign: "center",
            textWrap: "balance",
          }}
        >
          {subtitle}
        </div>
      ) : null}
      <SceneVoiceover file={voiceoverFile} />
    </AbsoluteFill>
  );
};
