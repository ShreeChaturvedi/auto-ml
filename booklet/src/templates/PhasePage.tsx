import React from "react";
import { COLORS, FONTS, TYPE, PAGE } from "../theme";
import { Page } from "../primitives/Page";
import { Eyebrow } from "../primitives/Eyebrow";
import { BrowserChromeFrame } from "../primitives/BrowserChromeFrame";
import { ScreenshotPlaceholder } from "../primitives/ScreenshotPlaceholder";
import { HandDrawnArrow } from "../primitives/HandDrawnArrow";
import { FortyFiveAngle } from "../primitives/FortyFiveAngle";
import { HOW } from "../content";

/**
 * PhasePage — the 6 workflow-phase pages (10-15). Every phase uses the same
 * template so the reader perceives one continuous journey:
 *   · section eyebrow + phase number
 *   · phase name (h1) + 1-sentence purpose
 *   · browser-chrome framed screenshot (or placeholder)
 *   · 2-4 curly Bezier arrows pointing to serif italic margin labels
 *   · hand-off line at the page foot
 */

export type PhasePageProps = {
  phase: (typeof HOW.phases)[number];
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
  sectionLabel: string;
  sectionColor: string;
};

export const PhasePage: React.FC<PhasePageProps> = ({
  phase,
  parity,
  pageNumber,
  totalPages,
  sectionLabel,
  sectionColor,
}) => {
  return (
    <Page
      parity={parity}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionLabel={sectionLabel}
      sectionColor={sectionColor}
    >
      {/* Eyebrow — phase counter */}
      <Eyebrow color={sectionColor}>
        PHASE {phase.num} · HOW
      </Eyebrow>

      {/* Headline + purpose */}
      <h1
        style={{
          fontFamily: FONTS.SANS,
          fontSize: TYPE.h1.size,
          fontWeight: TYPE.h1.weight,
          letterSpacing: TYPE.h1.tracking,
          lineHeight: TYPE.h1.lh,
          color: COLORS.INK,
          margin: "8px 0 6px",
        }}
      >
        {phase.name}
      </h1>
      <p
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 18,
          lineHeight: 1.3,
          color: COLORS.INK_MUTED,
          margin: 0,
          maxWidth: "6in",
        }}
      >
        {phase.purpose}
      </p>

      {/* 45° structural rule — decorative slice in the upper-outer corner */}
      <FortyFiveAngle
        length={88}
        top={12}
        left={parity === "recto" ? 520 : 12}
        color={sectionColor}
        strokeWidth={0.75}
      />

      {/* Screenshot frame — centered on page, fixed width */}
      <div style={{ margin: "28px auto 0", width: "5.5in" }}>
        <BrowserChromeFrame>
          <ScreenshotPlaceholder
            slug={phase.slug}
            description={phase.placeholderDescription}
            aspectRatio={4 / 3}
          />
        </BrowserChromeFrame>
      </div>

      {/* Hand-drawn arrows + italic margin labels. Anchored off the page
          padding so the arrows land just outside the screenshot frame. */}
      <CalloutsLayer
        callouts={phase.callouts}
        parity={parity}
        sectionColor={sectionColor}
      />

      {/* Hand-off footer — one-line teaser into the next phase. */}
      <div
        style={{
          position: "absolute",
          left: `${PAGE.margin.outer}in`,
          right: `${PAGE.margin.outer}in`,
          bottom: "1.15in",
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 14,
          color: COLORS.INK_MUTED,
          textAlign: parity === "recto" ? "right" : "left",
        }}
      >
        {phase.handoff}
      </div>
    </Page>
  );
};

const CalloutsLayer: React.FC<{
  callouts: ReadonlyArray<{ readonly label: string; readonly side: string }>;
  parity: "recto" | "verso";
  sectionColor: string;
}> = ({ callouts, parity, sectionColor }) => {
  const frameLeftIn =
    (parity === "recto" ? PAGE.margin.inner : PAGE.margin.outer) + 0;
  // Screenshot frame sits in the middle; arrows drop from ~220px to ~480px
  // down the page (below eyebrow, above hand-off).
  return (
    <>
      {callouts.map((c, i) => {
        const onLeft = c.side === "left";
        const yTop = 250 + i * 70;
        return (
          <div key={i}>
            <HandDrawnArrow
              direction={onLeft ? "right" : "left"}
              width={120}
              height={22}
              color={sectionColor}
              style={{
                position: "absolute",
                top: yTop,
                left: onLeft ? `${frameLeftIn + 0.3}in` : "auto",
                right: onLeft ? "auto" : "0.6in",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: yTop - 22,
                left: onLeft ? "0.3in" : "auto",
                right: onLeft ? "auto" : "0.3in",
                maxWidth: "1.6in",
                fontFamily: FONTS.SERIF,
                fontStyle: "italic",
                fontSize: 11,
                lineHeight: 1.3,
                color: COLORS.INK_MUTED,
                textAlign: onLeft ? "left" : "right",
              }}
            >
              {c.label}
            </div>
          </div>
        );
      })}
    </>
  );
};
