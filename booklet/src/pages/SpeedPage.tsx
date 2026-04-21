import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, SECTION } from "../theme";
import { PROOF } from "../content";
import { SpeedBarChart } from "../visuals/SpeedBarChart";
import { PullQuote } from "../primitives/PullQuote";

/** Page 21 — Speed: 7× hero stat + SpeedBarChart. */
export const SpeedPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <BodyPage
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="PROOF"
    sectionColor={SECTION["04_PROOF"]}
    eyebrow="§04 · PROOF · SPEED"
    headline="Time-to-model, measured."
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2.4in 1fr",
        columnGap: 20,
        alignItems: "start",
        marginTop: 8,
      }}
    >
      {/* Left — hero stat */}
      <div>
        <div
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 160,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 0.9,
            color: SECTION["04_PROOF"],
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {PROOF.speed.heroNumber}
        </div>
        <div
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 20,
            lineHeight: 1.2,
            color: COLORS.INK,
            marginTop: 6,
          }}
        >
          {PROOF.speed.heroCaption}
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: FONTS.MONO,
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: COLORS.INK_SUBTLE,
            lineHeight: 1.4,
          }}
        >
          {PROOF.speed.method}
        </div>
      </div>

      {/* Right — SpeedBarChart */}
      <div>
        <SpeedBarChart accent={SECTION["04_PROOF"]} />
      </div>
    </div>

    <div style={{ marginTop: 36, display: "flex", justifyContent: "flex-end" }}>
      <PullQuote size="small" style={{ maxWidth: "5in", textAlign: "right" }}>
        {PROOF.speed.pullQuote}
      </PullQuote>
    </div>
  </BodyPage>
);
