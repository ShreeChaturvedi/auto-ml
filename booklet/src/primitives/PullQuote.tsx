import React from "react";
import { COLORS, FONTS, TYPE } from "../theme";

/**
 * Instrument Serif italic pull-quote. Default size is 28pt; `size="small"`
 * drops to 24pt for sidebar and margin callouts. Color defaults to INK but
 * accepts any section accent when the quote sits on a colored panel.
 */
export const PullQuote: React.FC<{
  children: React.ReactNode;
  size?: "small" | "default";
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, size = "default", color = COLORS.INK, style }) => {
  const t = size === "small" ? TYPE.pullQuoteSmall : TYPE.pullQuote;
  return (
    <p
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: t.size,
        fontWeight: t.weight,
        letterSpacing: t.tracking,
        lineHeight: t.lh,
        color,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </p>
  );
};
