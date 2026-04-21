import React from "react";

/**
 * 0.5pt 50% gray horizontal rule — the MIT Tech Review inter-paragraph rhythm.
 * Used between paragraph clusters on narrative-heavy pages.
 */
export const HorizontalRule: React.FC<{ marginY?: number }> = ({
  marginY = 16,
}) => (
  <hr
    style={{
      border: "none",
      borderTop: "0.5pt solid rgba(23, 23, 23, 0.5)",
      margin: `${marginY}px 0`,
      width: "100%",
    }}
  />
);
