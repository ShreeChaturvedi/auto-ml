import React from "react";
import { Img, staticFile } from "remotion";
import { REGULAR_FONT } from "../../config/fonts";
import type { Theme } from "../../config/themes";
import { COLORS } from "../../config/themes";
import { useFadeIn } from "../helpers/useFadeIn";

export type BrandChipProps = {
  theme: Theme;
  /** Frames to wait before the fade-in starts. */
  delay: number;
  /** Public path passed to `staticFile` (e.g. "branding/ebc.webp"). */
  src: string;
  /**
   * Rendered height in px. Width derives from the asset's intrinsic aspect.
   * Use ~48 for self-labeled wordmarks, ~26 for letter-marks paired with a label.
   */
  logoHeight: number;
  /**
   * Optional sibling label. Omit for self-labeled wordmarks (e.g. EBC) —
   * otherwise you duplicate the company name.
   */
  label?: string;
};

/** Institution/company label styling — co-located with the only consumer. */
const INSTITUTION_LABEL_STYLE: React.CSSProperties = {
  ...REGULAR_FONT,
  fontWeight: 600,
  fontSize: 15,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  lineHeight: 1.2,
};

/**
 * Brand/institution chip — one primitive for both the professional (company)
 * row and the academic (school) row on the Team slide. Fades in via a single
 * `useFadeIn` wrapper (the `<Img>` itself does NOT fade — this avoids the
 * double-fade multiplication bug that afflicted the old `InstitutionChip` when
 * it composed `MiamiMark` (which has its own fade) inside a fading wrapper).
 */
export const BrandChip: React.FC<BrandChipProps> = ({
  theme,
  delay,
  src,
  logoHeight,
  label,
}) => {
  const c = COLORS[theme];
  const fade = useFadeIn({ translateY: 6, delay });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity: fade.opacity,
        transform: fade.transform,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          height: logoHeight,
          width: "auto",
          display: "block",
        }}
      />
      {label ? (
        <div style={{ ...INSTITUTION_LABEL_STYLE, color: c.WORD_COLOR_ON_BG_APPEARED }}>
          {label}
        </div>
      ) : null}
    </div>
  );
};
