import React from "react";

/** Thin vertical rule used as an inline phrase separator. Mirrors
 *  `video/remotion/primitives/CaptionPipe.tsx`. Uses `currentColor` + `em`
 *  sizing so it inherits from whatever parent typography context it lands in.
 *
 *  Pass `gap={0}` when the parent already controls spacing (e.g. inside a
 *  flex row with `gap`). Default keeps the inline `0.9em` rhythm used by
 *  the institutional caption in the Header.
 */
export const CaptionPipe: React.FC<{ gap?: number | string }> = ({
  gap = "0.9em",
}) => (
  <span
    aria-hidden
    style={{
      display: "inline-block",
      width: 1.5,
      height: "0.85em",
      margin: `0 ${typeof gap === "number" ? `${gap}px` : gap}`,
      background: "currentColor",
      opacity: 0.45,
      flexShrink: 0,
    }}
  />
);
