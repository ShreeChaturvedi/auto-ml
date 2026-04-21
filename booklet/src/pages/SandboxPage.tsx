import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { INSIDE } from "../content";
import { SandboxArchitecture } from "../diagrams/SandboxArchitecture";
import { ApprovalGateCallout } from "../primitives/ApprovalGateCallout";

/** Page 19 — sandbox & kernel architecture. */
export const SandboxPage: React.FC<{
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
    eyebrow="§03 · INSIDE · THE RUNTIME UNLOCK"
    headline={INSIDE.sandbox.headline}
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
        margin: "0 0 14px",
      }}
    >
      {INSIDE.sandbox.body}
    </p>

    <div
      style={{
        width: "100%",
        height: "4.6in",
        background: COLORS.PAPER_ELEVATED,
        border: `0.75pt solid ${COLORS.HAIRLINE}`,
        borderRadius: 6,
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      <SandboxArchitecture width={600} height={400} />
    </div>

    {/* Approval-gate callout — the third budgeted instance. */}
    <div style={{ marginTop: 18 }}>
      <ApprovalGateCallout>
        {INSIDE.sandbox.approvalGate}
      </ApprovalGateCallout>
    </div>
  </BodyPage>
);
