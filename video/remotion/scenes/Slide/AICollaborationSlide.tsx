import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ARCH_PALETTE } from "../../../config/arch-layout";
import { AI_COLLAB } from "../../../config/reflection-content";
import { AI_LAYOUT } from "../../../config/reflection-layout";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, REGULAR_FONT, TITLE_FONT } from "../../../config/fonts";
import { COLORS } from "../../../config/themes";
import { useFadeIn } from "../../helpers/useFadeIn";
import { FlourishUnderline } from "../../primitives/FlourishUnderline";
import { ScaleInNumber } from "../../primitives/ScaleInNumber";
import { SlideShell } from "../../primitives/SlideShell";
import { TechIcon } from "../../primitives/TechIcon";
import { LABEL_RATE, TypeOnText } from "../../primitives/TypeOnText";
import {
  useStaggeredFadeIn,
  type StaggeredItem,
} from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

// PHASES sum = 480 f (8 s). 8 phases.
const PHASES = [30, 30, 30, 60, 150, 60, 60, 60] as const;
type EightPhases = [
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
  PhaseInfo, PhaseInfo, PhaseInfo, PhaseInfo,
];
type ThreeItems = [StaggeredItem, StaggeredItem, StaggeredItem];

export const AICollaborationSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const [
    pShell,
    pTitle,
    pFlourish,
    pCards,
    pContent,
  ] = useTimeline([...PHASES]) as EightPhases;

  const frame = useCurrentFrame();
  const c = COLORS[theme];

  const shellFade = useFadeIn({ delay: pShell.start, durationInFrames: 30 });
  const title = useFadeIn({
    delay: pTitle.start,
    translateY: 12,
    damping: 200,
  });
  // `pHold.start` lands at frame ~420; slide ends at 480. Promoting the strip
  // to the content phase keeps it visible through the whole hold.
  const methodFade = useFadeIn({
    delay: pContent.start + 140,
    translateY: 4,
    damping: 200,
  });

  const cardItems = useStaggeredFadeIn(3, {
    step: 20,
    startDelay: pCards.start,
    translateY: 24,
    damping: 200,
  }) as ThreeItems;

  // Left-anchored ticker row — 3 static pills fade in with a stagger so all
  // three read together at the "eleven sprints · 324 issues · one engine"
  // beat. Previous NDJSONTape right-anchored + scrolled, hiding pills until
  // frame ~480.
  const tapePills = useStaggeredFadeIn(3, {
    step: 18,
    startDelay: pContent.start + 80,
    translateY: 8,
    damping: 200,
  }) as ThreeItems;

  return (
    <SlideShell theme={theme} eyebrow={AI_COLLAB.eyebrow} divider footer>
      <div style={{ position: "absolute", inset: 0, opacity: shellFade.opacity }}>
        {/* Title with flourish under "collaborators." */}
        <div
          style={{
            position: "absolute",
            left: AI_LAYOUT.title.x,
            top: AI_LAYOUT.title.y,
            width: AI_LAYOUT.title.w,
            ...TITLE_FONT,
            fontSize: 52,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: c.WORD_COLOR_ON_BG_APPEARED,
            opacity: title.opacity,
            transform: title.transform,
          }}
        >
          The AI{" "}
          <span
            style={{
              position: "relative",
              display: "inline-block",
              lineHeight: 1.1,
            }}
          >
            {AI_COLLAB.flourishTarget}
            <FlourishUnderline
              delay={pFlourish.start}
              drawOut={false}
              color={ARCH_PALETTE.miamiRed}
              style={{
                position: "absolute",
                top: "calc(100% - 4px)",
                left: 0,
                width: "100%",
                height: 16,
              }}
            />
          </span>{" "}
          that made this ship.
        </div>

        {/* 3 collaborator cards — Gemini center is the hero. */}
        {AI_COLLAB.cards.map((card, i) => {
          const item = cardItems[i]!;
          const contentStart = pContent.start + i * 20;
          return (
            <CollaboratorCard
              key={card.title}
              item={item}
              card={card}
              x={AI_LAYOUT.cards.xs[i]!}
              contentStart={contentStart}
            />
          );
        })}

        {/* Left-anchored invocation strip — 3 static pills, stagger-fade. */}
        <div
          style={{
            position: "absolute",
            left: AI_LAYOUT.tape.x,
            top: AI_LAYOUT.tape.y,
            width: AI_LAYOUT.tape.w,
            height: AI_LAYOUT.tape.h,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          {AI_COLLAB.tape.map((t, i) => {
            const item = tapePills[i]!;
            return (
              <div
                key={t.id}
                style={{
                  opacity: item.opacity,
                  transform: item.transform,
                  width: 340,
                  height: 40,
                  background: ARCH_PALETTE.paper,
                  border: `1px solid ${ARCH_PALETTE.hairline}`,
                  borderLeft: `3px solid ${t.color}`,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 14px",
                  ...MONOSPACE_FONT,
                  fontSize: 14,
                  fontWeight: 500,
                  color: ARCH_PALETTE.ink,
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
              </div>
            );
          })}
        </div>

        {/* Methodology strip at the bottom. */}
        <div
          style={{
            position: "absolute",
            left: 120,
            top: AI_LAYOUT.methodStripY,
            ...MONOSPACE_FONT,
            fontSize: 14,
            letterSpacing: "0.14em",
            color: c.WORD_COLOR_ON_BG_GREYED,
            opacity: methodFade.opacity,
            transform: methodFade.transform,
          }}
        >
          {AI_COLLAB.methodStrip}
        </div>

        {/* Faint horizontal guide under cards before the tape — kept for the
         *  visual rhythm established on the benchmark hook card rail. */}
        <div
          style={{
            position: "absolute",
            left: 120,
            right: 120,
            top: AI_LAYOUT.cards.y + AI_LAYOUT.cards.h + 20,
            height: 1,
            background: ARCH_PALETTE.hairline,
            opacity: interpolate(
              frame,
              [pContent.start, pContent.end],
              [0, 0.6],
              { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
          }}
        />
      </div>
    </SlideShell>
  );
};

type CollabCardData = (typeof AI_COLLAB.cards)[number];

const CollaboratorCard: React.FC<{
  item: StaggeredItem;
  card: CollabCardData;
  x: number;
  contentStart: number;
}> = ({ item, card, x, contentStart }) => {
  const frame = useCurrentFrame();
  // Content fades are tightened so all three cards land title/body/chip by
  // slide-frame ~250 (14f after hold begins) — previously chips drifted to
  // contentStart+140 and never read before the slide ended.
  const eyebrowOpacity = interpolate(
    frame,
    [contentStart, contentStart + 15],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const bodyOpacity = interpolate(
    frame,
    [contentStart + 30, contentStart + 50],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const chipOpacity = interpolate(
    frame,
    [contentStart + 45, contentStart + 60],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: AI_LAYOUT.cards.y,
        width: AI_LAYOUT.cards.w,
        height: AI_LAYOUT.cards.h,
        padding: AI_LAYOUT.cards.padding,
        borderRadius: 12,
        background: "#FFFFFF",
        border: `1px solid ${card.hero ? ARCH_PALETTE.accentBlue : ARCH_PALETTE.hairline}`,
        boxShadow: card.hero
          ? "0 12px 32px -8px rgba(29,78,216,0.18)"
          : "0 4px 16px rgba(0,0,0,0.04)",
        opacity: item.opacity,
        transform: item.transform,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          color: ARCH_PALETTE.ink,
          gap: 10,
        }}
      >
        <TechIcon name="custom" asset={card.icon} size={48} tone="mono" delay={contentStart} />
        {card.hero ? (
          <div
            style={{
              marginLeft: "auto",
              ...TITLE_FONT,
              fontSize: 22,
              fontWeight: 700,
              color: ARCH_PALETTE.accentBlue,
            }}
          >
            <ScaleInNumber value="+1" delay={contentStart + 60} />
          </div>
        ) : null}
      </div>

      <div
        style={{
          ...MONOSPACE_FONT,
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: ARCH_PALETTE.mute,
          opacity: eyebrowOpacity,
          marginTop: 18,
        }}
      >
        {card.eyebrow}
      </div>

      <div
        style={{
          ...TITLE_FONT,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: ARCH_PALETTE.ink,
          marginTop: 8,
          minHeight: 44,
        }}
      >
        <TypeOnText
          text={card.title}
          rate={LABEL_RATE}
          delay={contentStart + 10}
          caret={false}
        />
      </div>

      <div
        style={{
          ...REGULAR_FONT,
          fontSize: 17,
          lineHeight: 1.45,
          color: ARCH_PALETTE.muteFg,
          marginTop: 14,
          opacity: bodyOpacity,
          flex: 1,
        }}
      >
        {card.copy}
      </div>

      <div
        style={{
          ...MONOSPACE_FONT,
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: ARCH_PALETTE.mute,
          padding: "8px 12px",
          background: "#F5F5F5",
          border: `1px solid ${ARCH_PALETTE.hairline}`,
          borderRadius: 6,
          opacity: chipOpacity,
          alignSelf: "flex-start",
          marginTop: 16,
        }}
      >
        {card.chip}
      </div>
    </div>
  );
};
