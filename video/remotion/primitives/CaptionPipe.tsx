import React from "react";

/**
 * Thin vertical caption rule used as an inline phrase-separator.
 *
 * A bare `|` at caption weight is too dense and too tall; a 1.25-px bar at
 * 0.85 em with 45% of the parent's alpha reads as a divider, not a glyph.
 * Width and `em`-based height let the same primitive sit inside a 15-px
 * footnote, a 22-px tech list, or a 24-px institutional caption without
 * per-site tuning.
 *
 * `currentColor` and `em` sizing mean the divider inherits color and scale
 * from the parent typography, so adding it to a new surface is a zero-tuning
 * drop-in.
 */
export const CaptionPipe: React.FC = () => (
  <span
    aria-hidden
    style={{
      display: "inline-block",
      width: 1.25,
      height: "0.85em",
      margin: "0 0.9em",
      background: "currentColor",
      opacity: 0.45,
    }}
  />
);
