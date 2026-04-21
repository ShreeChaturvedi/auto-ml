import React from "react";
import { COLORS, FONTS, TYPE, PAGE } from "../theme";
import { BRAND, INSTITUTION } from "../content";
import { AnimatedLogoMark } from "../visuals/AnimatedLogoMark";

/**
 * Front cover (page 01). Full-bleed cream ground with the Gemini topographic
 * diorama as the hero art slot; title block in the lower-right, vertical
 * Monaspace margin callout on the left. Until the Gemini SVG (`art/cover-front.svg`)
 * lands we render a labeled placeholder that keeps the layout honest.
 */
export const CoverPage: React.FC = () => (
  <section
    className="page"
    data-bleed="true"
    style={{
      background: COLORS.PAPER_WARM,
      position: "relative",
      overflow: "hidden",
    }}
  >
    {/* 3D diorama slot — wraparound topographic peak with 'A' summit. */}
    <CoverArt src="/art/cover-front.svg" />

    {/* The canonical 'A' mark rides on top at the peak, in Miami Red.
        Positioned manually so it roughly aligns with the diorama's apex
        even before the Gemini art arrives. */}
    <div
      style={{
        position: "absolute",
        top: "2.4in",
        left: "50%",
        transform: "translateX(-50%)",
      }}
    >
      <AnimatedLogoMark size={96} color={COLORS.MIAMI_RED} />
    </div>

    {/* Vertical Monaspace margin callout — left edge */}
    <div
      style={{
        position: "absolute",
        left: "0.5in",
        top: `${PAGE.margin.top}in`,
        writingMode: "vertical-rl",
        transform: "rotate(180deg)",
        fontFamily: FONTS.MONO,
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
      }}
    >
      miami cse · expo 2026
    </div>

    {/* Title block — bottom-right */}
    <div
      style={{
        position: "absolute",
        right: "0.65in",
        bottom: "0.85in",
        textAlign: "right",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          lineHeight: 0.95,
          color: COLORS.INK,
        }}
      >
        AGENTIC
        <br />
        AUTOML
      </div>
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 16,
          fontWeight: 400,
          color: COLORS.INK_MUTED,
          letterSpacing: "0",
        }}
      >
        A printed system card · Vol. 01
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
        }}
      >
        {INSTITUTION.captionFull}
      </div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
        }}
      >
        {BRAND.liveUrl}
      </div>
    </div>
  </section>
);

const CoverArt: React.FC<{ src: string }> = ({ src }) => {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `
            radial-gradient(ellipse at 50% 35%,
              ${COLORS.MIAMI_RED} 0%,
              rgba(200, 16, 46, 0.12) 22%,
              transparent 40%
            ),
            repeating-radial-gradient(
              circle at 50% 45%,
              rgba(29, 78, 216, 0.06) 0px,
              rgba(29, 78, 216, 0.06) 3px,
              transparent 3px,
              transparent 18px
            )
          `,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: TYPE.eyebrow.size,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
            opacity: 0.6,
            textAlign: "center",
          }}
        >
          3D diorama slot
          <br />
          art/cover-front.svg
        </div>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
      }}
    />
  );
};
