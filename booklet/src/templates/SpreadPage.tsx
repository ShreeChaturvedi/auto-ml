import React from "react";
import { Page } from "../primitives/Page";
import { Eyebrow } from "../primitives/Eyebrow";
import { SprintTimeline } from "../diagrams/SprintTimeline";
import { COLORS } from "../theme";

/**
 * Spread template — pages 24/25 only. Each half renders one SprintTimeline
 * component with the appropriate `half` prop so the two adjacent pages
 * align across the gutter into one continuous infographic.
 */
export type SpreadPageProps = {
  half: "left" | "right";
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
  sectionLabel: string;
  sectionColor: string;
};

export const SpreadPage: React.FC<SpreadPageProps> = ({
  half,
  parity,
  pageNumber,
  totalPages,
  sectionLabel,
  sectionColor,
}) => (
  <Page
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel={sectionLabel}
    sectionColor={sectionColor}
  >
    <Eyebrow color={sectionColor} style={{ marginBottom: 8 }}>
      BUILD · SPRINT TIMELINE · {half === "left" ? "←" : "→"}
    </Eyebrow>
    <div style={{ height: 10 }} />
    <SprintTimelineWrapper half={half} />
  </Page>
);

const SpreadWidthPx = 510; // ≈ 6.75" in 0.25" steps — fits between margins
const SpreadHeightPx = 700;

const SprintTimelineWrapper: React.FC<{ half: "left" | "right" }> = ({
  half,
}) => (
  <div
    style={{
      width: SpreadWidthPx,
      height: SpreadHeightPx,
      marginTop: 4,
      background: COLORS.PAPER,
    }}
  >
    <SprintTimeline half={half} width={SpreadWidthPx} height={SpreadHeightPx} />
  </div>
);
