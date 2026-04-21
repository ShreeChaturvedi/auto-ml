import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { COLORS, FONTS, TYPE, SECTION } from "../theme";
import { WHY } from "../content";
import { HorizontalRule } from "../primitives/HorizontalRule";
import { Eyebrow } from "../primitives/Eyebrow";

/** Page 06 — "Why Now". 3 paragraphs + sidebar. */
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
    sectionColor={SECTION["01_WHY"]}
    eyebrow="§01 · WHY NOW"
    headline="Three things unlocked at once."
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.6in",
        columnGap: 20,
      }}
    >
      {/* Left — 3 paragraphs with eyebrows and rules between */}
      <div>
        {WHY.whyNow.eyebrows.map((eb, i) => (
          <React.Fragment key={eb.id}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <div
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  color: SECTION["01_WHY"],
                  letterSpacing: "0.14em",
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
                  fontSize: 16,
                  lineHeight: 1.25,
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
              <HorizontalRule marginY={14} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Right sidebar — 4 Mono callouts */}
      <aside>
        <Eyebrow color={SECTION["01_WHY"]} style={{ marginBottom: 10 }}>
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
                borderLeft: `2px solid ${SECTION["01_WHY"]}`,
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  </BodyPage>
);
