import React from "react";
import { COLORS, FONTS, TYPE, PAGE } from "../theme";
import { Page } from "../primitives/Page";
import { Eyebrow } from "../primitives/Eyebrow";
import { BrowserChromeFrame } from "../primitives/BrowserChromeFrame";
import { ScreenshotPlaceholder } from "../primitives/ScreenshotPlaceholder";
import { HandDrawnArrow } from "../primitives/HandDrawnArrow";
import { FortyFiveAngle } from "../primitives/FortyFiveAngle";
import { StatCallout } from "../primitives/StatCallout";
import { ToolCallExcerpt } from "../primitives/ToolCallExcerpt";
import { MiniProgressBand } from "../primitives/MiniProgressBand";
import { ApprovalGateMicroWidget } from "../primitives/ApprovalGateMicroWidget";
import { HOW } from "../content";

/**
 * PhasePage — the 6 workflow-phase pages (10-15). Three vertical zones:
 *   Zone 1 · eyebrow + h1 + purpose                      (top ~140px)
 *   Zone 2 · browser-chrome screenshot + callout arrows  (middle ~380px)
 *   Zone 3 · stats + tool-call + progress band           (lower ~320px)
 *   Footer · handoff teaser
 *
 * Phase 03 (Preprocess) runs a specialized Zone 3: the ApprovalGateMicroWidget
 * + stats take the full-width band so the "approval gate is the point"
 * beat lands as the book's hero. All other phases show a 2-col stats +
 * tool-call grid.
 */

type Phase = (typeof HOW.phases)[number];

export type PhasePageProps = {
  phase: Phase;
  parity: "recto" | "verso";
  pageNumber: number;
  totalPages: number;
  sectionLabel: string;
  sectionColor: string;
};

const PROGRESS_LABELS = HOW.phases.map((p) => p.name.split(" ")[0] ?? p.name);

export const PhasePage: React.FC<PhasePageProps> = ({
  phase,
  parity,
  pageNumber,
  totalPages,
  sectionLabel,
  sectionColor,
}) => {
  const phaseIndex = Number.parseInt(phase.num, 10) - 1;
  const isHero = phase.slug === "phase-03-preprocess";

  return (
    <Page
      parity={parity}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionLabel={sectionLabel}
      sectionColor={sectionColor}
    >
      {/* Zone 1 — eyebrow + headline + purpose */}
      <Eyebrow color={sectionColor}>
        PHASE {phase.num} · HOW
      </Eyebrow>

      <h1
        style={{
          fontFamily: FONTS.SANS,
          fontSize: TYPE.h1.size,
          fontWeight: TYPE.h1.weight,
          letterSpacing: TYPE.h1.tracking,
          lineHeight: TYPE.h1.lh,
          color: COLORS.INK,
          margin: "6px 0 4px",
        }}
      >
        {phase.name}
      </h1>
      <p
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 17,
          lineHeight: 1.3,
          color: COLORS.INK_MUTED,
          margin: 0,
          maxWidth: "6in",
        }}
      >
        {phase.purpose}
      </p>

      <FortyFiveAngle
        length={88}
        top={12}
        left={parity === "recto" ? 520 : 12}
        color={sectionColor}
        strokeWidth={0.75}
      />

      {/* Zone 2 — screenshot frame. Hero phase trims the frame aspect so
          Zone 3 (with its approval widget) has room for the hero beat. */}
      <div
        style={{
          margin: isHero ? "14px auto 22px" : "18px auto 28px",
          width: "5.6in",
        }}
      >
        <BrowserChromeFrame>
          <ScreenshotPlaceholder
            slug={phase.slug}
            description={phase.placeholderDescription}
            aspectRatio={isHero ? 16 / 9 : 16 / 11}
          />
        </BrowserChromeFrame>
      </div>

      <CalloutsLayer
        callouts={phase.callouts}
        parity={parity}
        sectionColor={sectionColor}
      />

      {/* Zone 3 — lower-band content + handoff line. Inline flow so the
          column fills from screenshot down to the page-number footer with
          no dead vertical band. */}
      <LowerBand
        phase={phase}
        isHero={isHero}
        phaseIndex={phaseIndex}
        sectionColor={sectionColor}
        parity={parity}
      />
    </Page>
  );
};

// ---------------------------------------------------------------------------
// Zone 3 — stats + tool-call + mini progress band.
// ---------------------------------------------------------------------------

const LowerBand: React.FC<{
  phase: Phase;
  isHero: boolean;
  phaseIndex: number;
  sectionColor: string;
  parity: "recto" | "verso";
}> = ({ phase, isHero, phaseIndex, sectionColor, parity }) => {
  // Hero (p12): ApprovalGateMicroWidget spans full-width above a 2-col
  // stat+tool row. Non-hero: 2-col (stat | tool) with progress band below.
  return (
    <div
      style={{
        position: "absolute",
        left: `${PAGE.margin.outer}in`,
        right: `${PAGE.margin.outer}in`,
        top: isHero ? "5.6in" : "6.45in",
        bottom: "0.85in",
        display: "flex",
        flexDirection: "column",
        gap: isHero ? 12 : 14,
      }}
    >
      {isHero && (
        <div
          style={{
            border: `0.5pt solid ${COLORS.HAIRLINE}`,
            borderLeft: `2pt solid ${COLORS.MIAMI_RED}`,
            background: COLORS.PAPER_ELEVATED,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: COLORS.MIAMI_RED,
            }}
          >
            THE APPROVAL GATE · ON THE PATH, NOT BESIDE IT
          </div>
          <ApprovalGateMicroWidget />
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 18,
          alignItems: "stretch",
        }}
      >
        {phase.stats && (
          <StatCallout rows={phase.stats} accent={sectionColor} />
        )}
        {phase.toolCall && (
          <ToolCallExcerpt
            tool={phase.toolCall.tool}
            args={phase.toolCall.args}
            note={phase.toolCall.note}
            accent={sectionColor}
          />
        )}
      </div>

      <MiniProgressBand
        labels={PROGRESS_LABELS}
        current={phaseIndex}
        accent={sectionColor}
      />

      {phase.inlineNote && (
        <p
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 12.5,
            lineHeight: 1.45,
            color: COLORS.INK_MUTED,
            margin: 0,
            paddingTop: 10,
            borderTop: `0.25pt solid ${COLORS.HAIRLINE}`,
            maxWidth: "6.8in",
          }}
        >
          {phase.inlineNote}
        </p>
      )}

      {/* Handoff rail — teaser + context line, pinned flush against the
          page-number footer so Zone 3 fills all the way down. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 16,
          marginTop: "auto",
          paddingTop: 14,
          borderTop: `0.5pt solid ${COLORS.HAIRLINE_STRONG}`,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: COLORS.INK_MUTED,
            order: parity === "recto" ? 1 : 2,
          }}
        >
          NEXT · 0{phaseIndex + 2 > 6 ? 1 : phaseIndex + 2} · {nextPhaseName(phaseIndex)}
        </div>
        <div
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: "italic",
            fontSize: 14,
            color: COLORS.INK,
            order: parity === "recto" ? 2 : 1,
          }}
        >
          {phase.handoff}
        </div>
      </div>
    </div>
  );
};

function nextPhaseName(i: number): string {
  const next = HOW.phases[(i + 1) % HOW.phases.length];
  return next?.name.toUpperCase() ?? "";
}

// ---------------------------------------------------------------------------
// Callouts layer (unchanged arrows + italic labels).
// ---------------------------------------------------------------------------

const CalloutsLayer: React.FC<{
  callouts: ReadonlyArray<{ readonly label: string; readonly side: string }>;
  parity: "recto" | "verso";
  sectionColor: string;
}> = ({ callouts, parity, sectionColor }) => {
  // Screenshot frame is 5.6in wide, centered in a 7in content area — its
  // outer edge sits ~1.45in from the page margin. Callout text fits in the
  // 0.3–1.0in strip; a 0.35in arrow bridges from text to the frame edge.
  void parity;
  return (
    <>
      {callouts.map((c, i) => {
        const onLeft = c.side === "left";
        const yTop = 262 + i * 70;
        return (
          <div key={i}>
            <HandDrawnArrow
              direction={onLeft ? "right" : "left"}
              width={60}
              height={16}
              color={sectionColor}
              style={{
                position: "absolute",
                top: yTop,
                left: onLeft ? "1.02in" : "auto",
                right: onLeft ? "auto" : "1.02in",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: yTop - 28,
                left: onLeft ? "0.28in" : "auto",
                right: onLeft ? "auto" : "0.28in",
                width: "0.88in",
                fontFamily: FONTS.SERIF,
                fontStyle: "italic",
                fontSize: 9.5,
                lineHeight: 1.28,
                color: COLORS.INK_MUTED,
                textAlign: onLeft ? "right" : "left",
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
