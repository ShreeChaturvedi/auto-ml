import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { INSIDE } from "../content";
import { PreprocessingFSM } from "../diagrams/PreprocessingFSM";

/** Page 17 — preprocessing FSM hero axonometric. */
export const PreprocessingFsmPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <BodyPage
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="INSIDE"
    sectionColor={SECTION["03_INSIDE"]}
    eyebrow="§03 · INSIDE · THE MODEL UNLOCK"
    headline={INSIDE.preprocessingFsm.headline}
  >
    <p
      style={{
        fontFamily: FONTS.SANS,
        fontSize: TYPE.body.size,
        fontWeight: TYPE.body.weight,
        letterSpacing: TYPE.body.tracking,
        lineHeight: TYPE.body.lh,
        color: COLORS.INK,
        maxWidth: "6.4in",
        margin: "0 0 20px",
      }}
    >
      {INSIDE.preprocessingFsm.body}
    </p>

    <div
      style={{
        width: "100%",
        height: "5.6in",
        background: COLORS.PAPER_ELEVATED,
        border: `0.75pt solid ${COLORS.HAIRLINE}`,
        borderRadius: 6,
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      <PreprocessingFSM width={600} height={360} />
    </div>
  </BodyPage>
);
