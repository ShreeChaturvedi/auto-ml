import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { WHY } from "../content";
import { HorizontalRule } from "../primitives/HorizontalRule";
import { Eyebrow } from "../primitives/Eyebrow";

const WHY_RED = SECTION["01_WHY"];

/** Page 06 — "Why Now". Three pillars on top, counterfactual timeline below. */
export const WhyNowPage: React.FC<{
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
}> = ({ parity, pageNumber, totalPages }) => (
  <BodyPage
    parity={parity}
    pageNumber={pageNumber}
    totalPages={totalPages}
    sectionLabel="WHY"
    sectionColor={WHY_RED}
    eyebrow="§01 · WHY NOW"
    headline="Three things unlocked at once."
  >
    {/* ────────────────────────────────────────────────────────────────
        Upper half — three pillars (MODELS / PROTOCOLS / RUNTIME) with
        a by-the-stack sidebar. Structure preserved from Agent 2's pass.
       ──────────────────────────────────────────────────────────────── */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.6in",
        columnGap: 20,
      }}
    >
      <div>
        {WHY.whyNow.eyebrows.map((eb, i) => (
          <React.Fragment key={eb.id}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: TYPE.eyebrow.size,
                  fontWeight: 700,
                  color: WHY_RED,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  minWidth: 52,
                }}
              >
                {eb.id} / {eb.label}
              </div>
              <div
                style={{
                  fontFamily: FONTS.SERIF,
                  fontStyle: "italic",
                  fontSize: TYPE.subheadMedium.size,
                  lineHeight: TYPE.subheadMedium.lh,
                  color: COLORS.INK,
                }}
              >
                {eb.headline}
              </div>
            </div>
            <p
              style={{
                fontFamily: FONTS.SANS,
                fontSize: TYPE.body.size,
                fontWeight: TYPE.body.weight,
                letterSpacing: TYPE.body.tracking,
                lineHeight: TYPE.body.lh,
                color: COLORS.INK,
                margin: "6px 0 0",
              }}
            >
              {WHY.whyNow.body[i]}
            </p>
            {i < WHY.whyNow.eyebrows.length - 1 && (
              <HorizontalRule marginY={12} />
            )}
          </React.Fragment>
        ))}
      </div>

      <aside>
        <Eyebrow color={WHY_RED} style={{ marginBottom: 10 }}>
          BY THE STACK
        </Eyebrow>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {WHY.whyNow.sidebar.map((item, i) => (
            <li
              key={i}
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 9,
                fontWeight: 600,
                lineHeight: 1.3,
                color: COLORS.INK,
                letterSpacing: "0.02em",
                paddingLeft: 10,
                borderLeft: `2px solid ${WHY_RED}`,
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      </aside>
    </div>

    {/* ────────────────────────────────────────────────────────────────
        Lower half — "why not earlier?" counterfactual timeline.
        Seven rows, 2020→2026, each with one year's unlock + the gap
        that kept agentic AutoML un-buildable until Opus 4.7 closed
        the reliability gap in 2026.
       ──────────────────────────────────────────────────────────────── */}
    <WhyNotEarlierTimeline />
  </BodyPage>
);

const WhyNotEarlierTimeline: React.FC = () => (
  <section style={{ marginTop: 22 }}>
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 14,
        marginBottom: 10,
      }}
    >
      <Eyebrow color={WHY_RED}>WHY NOT EARLIER</Eyebrow>
      <div
        style={{
          flex: 1,
          borderTop: `1.25pt solid ${WHY_RED}`,
          transform: "translateY(-3px)",
        }}
      />
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: TYPE.eyebrow.size,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.INK_SUBTLE,
        }}
      >
        2020 → 2026
      </div>
    </div>

    <p
      style={{
        fontFamily: FONTS.SERIF,
        fontStyle: "italic",
        fontSize: TYPE.subheadSmall.size,
        lineHeight: TYPE.subheadSmall.lh,
        color: COLORS.INK,
        margin: "0 0 10px",
        maxWidth: "5.4in",
      }}
    >
      {WHY.whyNow.timelineLead}
    </p>

    <div>
      {WHY.whyNow.timeline.map((row, i) => {
        const isNow = "isNow" in row && row.isNow;
        return (
          <React.Fragment key={row.year}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "0.6in 2.3in 1fr",
                columnGap: 16,
                alignItems: "baseline",
                padding: "6px 0 6px",
                background: isNow ? "rgba(196, 18, 48, 0.04)" : undefined,
                marginLeft: isNow ? -6 : 0,
                marginRight: isNow ? -6 : 0,
                paddingLeft: isNow ? 6 : 0,
                paddingRight: isNow ? 6 : 0,
                borderLeft: isNow ? `2px solid ${WHY_RED}` : undefined,
              }}
            >
              {/* Year — Mono, red on the 2026 row to anchor the payoff */}
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: isNow ? 15 : 13,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: isNow ? WHY_RED : COLORS.INK,
                  paddingLeft: isNow ? 4 : 0,
                }}
              >
                {row.year}
              </div>

              {/* Unlock — sans, medium weight; the "what landed" column */}
              <div
                style={{
                  fontFamily: FONTS.SANS,
                  fontSize: TYPE.body.size,
                  fontWeight: isNow ? 700 : 600,
                  letterSpacing: TYPE.body.tracking,
                  lineHeight: 1.25,
                  color: isNow ? WHY_RED : COLORS.INK,
                }}
              >
                {row.unlock}
              </div>

              {/* Gap — the causal argument. Italic serif on the 2026 row
                  to mark the resolution of the six-year setup. */}
              <div
                style={{
                  fontFamily: isNow ? FONTS.SERIF : FONTS.SANS,
                  fontStyle: isNow ? "italic" : "normal",
                  fontSize: isNow ? 12 : TYPE.body.size,
                  fontWeight: isNow ? 500 : TYPE.body.weight,
                  letterSpacing: TYPE.body.tracking,
                  lineHeight: 1.25,
                  color: isNow ? COLORS.INK : COLORS.INK_MUTED,
                }}
              >
                {row.gap}
              </div>
            </div>
            {i < WHY.whyNow.timeline.length - 1 && (
              <div
                style={{
                  borderTop: "0.5pt solid rgba(23, 23, 23, 0.18)",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>

    <div
      style={{
        marginTop: 10,
        fontFamily: FONTS.MONO,
        fontSize: TYPE.eyebrow.size,
        fontWeight: 500,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: COLORS.INK_SUBTLE,
      }}
    >
      AutoML tables ’19 · pyautoML ’20 · TPOT ’16 — all shipped before the
      agent loop was safe. None stuck.
    </div>
  </section>
);
