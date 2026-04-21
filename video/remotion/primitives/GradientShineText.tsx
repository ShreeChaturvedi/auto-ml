import React from "react";
import { useCurrentFrame } from "remotion";
import { SERIF_FONT } from "../../config/fonts";

// Frame-deterministic — DO NOT convert to CSS keyframes. Remotion's offline
// renderer will not execute CSS animations across frame chunks; every visual
// state must be computable from the current frame.

export type GradientShineTextProps = {
  text: string;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: number;
  periodFrames?: number;
  chromaMode?: "light" | "dark";
  style?: React.CSSProperties;
};

export const GradientShineText: React.FC<GradientShineTextProps> = ({
  text,
  fontSize,
  fontFamily = SERIF_FONT.fontFamily,
  fontWeight = 400,
  periodFrames = 480,
  chromaMode = "light",
  style,
}) => {
  const frame = useCurrentFrame();
  const pos = ((frame / periodFrames) * 300) % 300;
  const L = chromaMode === "light" ? 0.52 : 0.75;
  const C = chromaMode === "light" ? 0.09 : 0.06;
  return (
    <div
      style={{
        backgroundImage: `linear-gradient(90deg in oklch longer hue, oklch(${L} ${C} 0), oklch(${L} ${C} 120), oklch(${L} ${C} 240), oklch(${L} ${C} 360))`,
        backgroundSize: "300% 100%",
        backgroundPosition: `${pos}% 0`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        fontFamily,
        fontWeight,
        fontSize,
        lineHeight: 1.1,
        ...style,
      }}
    >
      {text}
    </div>
  );
};
