import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import {
  PROOF,
  QUALITY,
  QUALITY_CELLS,
  LIMITATIONS,
  GUARDRAIL_NUANCE,
} from "../content";
import { PercentileGauge } from "../visuals/PercentileGauge";
import { GuardrailTable } from "../visuals/GuardrailTable";
import { Eyebrow } from "../primitives/Eyebrow";

/** Page 22 — Quality + Guardrails, split across top/bottom. */
export const QualityGuardrailsPage: React.FC<{
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
    eyebrow="§04 · PROOF · QUALITY + GUARDRAILS"
    headline="Top-tier placement with caught flaws."
  >
    {/* Top — Quality */}
    <section>
      <Eyebrow color={SECTION["04_PROOF"]} style={{ marginBottom: 8 }}>
        QUALITY · {QUALITY.headline}
      </Eyebrow>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 24,
          alignItems: "center",
        }}
      >
        <div>
          <PercentileGauge
            rank={QUALITY.heroRank}
            baselineRank={QUALITY.baselineRank}
            accent={SECTION["04_PROOF"]}
          />
          <div
            style={{
              marginTop: 8,
              fontFamily: FONTS.MONO,
              fontSize: TYPE.eyebrow.size,
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: COLORS.INK_SUBTLE,
            }}
          >
            {QUALITY.footnote}
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {QUALITY_CELLS.map((cell) => (
            <div
              key={cell.dataset}
              style={{
                border: `0.5pt solid ${COLORS.HAIRLINE}`,
                borderRadius: 4,
                padding: "6px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: TYPE.eyebrow.size,
                  fontWeight: 600,
                  color: COLORS.INK_MUTED,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {cell.dataset}
              </div>
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 16,
                  fontWeight: 700,
                  color: COLORS.INK,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {cell.value}
              </div>
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: TYPE.eyebrow.size,
                  fontWeight: 600,
                  color: SECTION["04_PROOF"],
                  letterSpacing: "0.08em",
                }}
              >
                {cell.tier}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <hr
      style={{
        border: "none",
        borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
        margin: "18px 0 14px",
      }}
    />

    {/* Bottom — Guardrails */}
    <section>
      <Eyebrow color={SECTION["04_PROOF"]} style={{ marginBottom: 8 }}>
        GUARDRAILS · {PROOF.guardrails.headline}
      </Eyebrow>

      <p
        style={{
          fontFamily: FONTS.SANS,
          fontSize: TYPE.body.size,
          fontWeight: TYPE.body.weight,
          letterSpacing: TYPE.body.tracking,
          lineHeight: TYPE.body.lh,
          color: COLORS.INK,
          maxWidth: "5.5in",
          margin: "0 0 12px",
        }}
      >
        {PROOF.guardrails.caption}
      </p>

      <GuardrailTable accent={SECTION["04_PROOF"]} detailed />

      <div
        style={{
          marginTop: 8,
          fontFamily: FONTS.MONO,
          fontSize: TYPE.eyebrow.size,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
        }}
      >
        {PROOF.guardrails.method}
      </div>

      {/* Sklearn-nuance callout — reconciles the 2/20 vs 3/20 arithmetic so
          the competitive framing doesn't inflate. Sits in the narrow band
          between the table and LIMITATIONS. */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          columnGap: 14,
          alignItems: "start",
          padding: "10px 12px",
          border: `0.5pt solid ${COLORS.HAIRLINE}`,
          borderRadius: 4,
          background: COLORS.PAPER_ELEVATED,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1,
            color: COLORS.INK_MUTED,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
            paddingTop: 1,
          }}
        >
          +1
        </div>
        <div>
          <Eyebrow color={COLORS.INK_MUTED} style={{ marginBottom: 4 }}>
            {GUARDRAIL_NUANCE.eyebrow}
          </Eyebrow>
          <p
            style={{
              fontFamily: FONTS.SERIF,
              fontStyle: "italic",
              fontSize: 12,
              lineHeight: 1.4,
              color: COLORS.INK,
              margin: 0,
              maxWidth: "6.2in",
            }}
          >
            {GUARDRAIL_NUANCE.body}
          </p>
        </div>
      </div>
    </section>

    {/* Limitations — the "what we don't do yet" landing paragraph. Sits
        below the guardrail table so the proof chapter closes with an
        honest self-assessment instead of a victory lap. */}
    <section
      style={{
        marginTop: 14,
        padding: "12px 14px",
        borderLeft: `2pt solid ${SECTION["04_PROOF"]}`,
        background: COLORS.PAPER_ELEVATED,
      }}
    >
      <Eyebrow color={SECTION["04_PROOF"]} style={{ marginBottom: 6 }}>
        LIMITATIONS · WHAT WE DON'T DO YET
      </Eyebrow>
      <p
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 13,
          lineHeight: 1.45,
          color: COLORS.INK,
          margin: 0,
          maxWidth: "6.4in",
        }}
      >
        {LIMITATIONS.body}
      </p>
    </section>
  </BodyPage>
);
