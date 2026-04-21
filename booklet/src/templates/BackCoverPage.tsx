import React from "react";
import { COLORS, FONTS } from "../theme";
import { INSTITUTION } from "../content";

/**
 * Back cover (page 28). Full-bleed cream ground with the back portion of
 * the wraparound topographic diorama. Institutional colophon sits in the
 * upper-left; no page number.
 */
export const BackCoverPage: React.FC = () => (
  <section
    className="page"
    data-bleed="true"
    style={{
      background: COLORS.PAPER_WARM,
      position: "relative",
      overflow: "hidden",
    }}
  >
    <BackArt src="/art/cover-back.svg" />

    {/* Institutional colophon — upper-left */}
    <div
      style={{
        position: "absolute",
        top: "0.65in",
        left: "0.65in",
        fontFamily: FONTS.MONO,
        fontSize: 8,
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: COLORS.INK_MUTED,
        maxWidth: "3in",
        lineHeight: 1.4,
      }}
    >
      {INSTITUTION.university}
      <br />
      {INSTITUTION.course} · {INSTITUTION.track}
      <br />
      {INSTITUTION.year}
    </div>

    {/* Small italic line at bottom-right — booklet's last word */}
    <div
      style={{
        position: "absolute",
        bottom: "0.65in",
        right: "0.65in",
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: 13,
        color: COLORS.INK_MUTED,
        textAlign: "right",
      }}
    >
      — End of booklet.
    </div>
  </section>
);

const BackArt: React.FC<{ src: string }> = ({ src }) => {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            repeating-radial-gradient(
              circle at 50% 70%,
              rgba(29, 78, 216, 0.05) 0px,
              rgba(29, 78, 216, 0.05) 3px,
              transparent 3px,
              transparent 22px
            )
          `,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: COLORS.INK_SUBTLE,
            opacity: 0.55,
            textAlign: "center",
          }}
        >
          3D diorama slot
          <br />
          art/cover-back.svg
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
