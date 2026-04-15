import React from "react";
import { REGULAR_FONT } from "../../config/fonts";
import type { Theme } from "../../config/themes";
import { COLORS } from "../../config/themes";
import { useFadeIn } from "../helpers/useFadeIn";
import { MotionLine } from "./MotionLine";

export type EyebrowLabelProps = {
  children: React.ReactNode;
  theme: Theme;
  /** Fade-in delay in frames. Default 0. */
  delay?: number;
  /** If true, draw a 96px animated hairline rule below the label. Default false. */
  underline?: boolean;
};

/**
 * Editorial eyebrow label — Plus Jakarta Sans 600, uppercase, wide tracking,
 * greyed foreground. Matches the app's `.text-workflow-label font-semibold
 * uppercase tracking-wider` pattern (see `FileExplorer.tsx:193`).
 *
 * NOT monospace. NOT a caption. It's the small label above a title.
 */
export const EyebrowLabel: React.FC<EyebrowLabelProps> = ({
  children,
  theme,
  delay = 0,
  underline = false,
}) => {
  const { opacity, transform } = useFadeIn({ translateY: 4, delay });
  const color = COLORS[theme].WORD_COLOR_ON_BG_GREYED;

  return (
    <div style={{ opacity, transform }}>
      <div
        style={{
          ...REGULAR_FONT,
          fontWeight: 600,
          fontSize: 16,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color,
          lineHeight: 1.2,
        }}
      >
        {children}
      </div>
      {underline ? (
        <div style={{ marginTop: 8 }}>
          <MotionLine
            x1={0}
            y1={0}
            x2={96}
            y2={0}
            delay={delay + 6}
            strokeWidth={1}
            color={color}
          />
        </div>
      ) : null}
    </div>
  );
};
