import React from "react";
import { COLORS, FONTS, TYPE } from "../tokens";
import { LangGraphDiagram } from "../visuals/LangGraphDiagram";
import { LedgerCounterStrip } from "../visuals/LedgerCounterStrip";
import { SectionFrame } from "./SectionFrame";

/**
 * §3 · ARCHITECTURE — the LangGraph runtime diagram is the section's
 * centerpiece. Supporting evidence: a compact strip of Postgres ledger
 * tables (row counts from the real workflow ledger).
 */

export const Section3Architecture: React.FC = () => (
  <SectionFrame
    eyebrow="THE ARCHITECTURE"
    number="§3"
    headline="One LangGraph. Every step auditable."
    footnote={{
      label: "Stack",
      text: "LangGraph state machine · Postgres audit ledger · 29 lifecycle stages across 3 phase adapters",
    }}
  >
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        minHeight: 0,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.SANS,
          fontSize: TYPE.leadBody.size,
          fontWeight: TYPE.leadBody.weight,
          color: COLORS.INK,
          letterSpacing: TYPE.leadBody.tracking,
          lineHeight: TYPE.leadBody.lh,
        }}
      >
        A <strong style={{ fontWeight: 700 }}>probabilistic core</strong>{" "}
        (<code style={{ fontFamily: FONTS.MONO, fontSize: 24, color: COLORS.ACCENT_DEEP }}>invoke_model</code>){" "}
        wrapped in a <strong style={{ fontWeight: 700 }}>deterministic shell</strong> — one shared
        state graph, three phase adapters, 29 lifecycle stages.
      </div>

      {/* Diagram fills the available vertical space; height is roomy so
       *  the labelled annotations and the routeNextStep arc don't crowd. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <LangGraphDiagram width={1330} height={920} />
      </div>

      <div>
        <div
          style={{
            fontFamily: FONTS.SANS,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
            marginBottom: 10,
          }}
        >
          Postgres ledger · rows in production
        </div>
        <LedgerCounterStrip width={1330} height={108} />
      </div>
    </div>
  </SectionFrame>
);
