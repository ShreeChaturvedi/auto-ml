import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_IN, EASE_OUT, SPRING_HERO, SPRING_SETTLE } from "../../../config/easing";
import { MONOSPACE_FONT, SERIF_FONT, TITLE_FONT } from "../../../config/fonts";
import {
  ARCH_PALETTE,
  SCENE4_5_TRAINING_GRAPH,
  SCENE6,
} from "../../../config/arch-layout";
import {
  LEDGER_TABLES,
  NDJSON_EVENT_TYPES,
} from "../../../config/arch-content";
import { COLORS } from "../../../config/themes";
import { AgentEdge } from "../../primitives/AgentEdge";
import { CountUpNumber } from "../../primitives/CountUpNumber";
import { CounterStrip } from "../../primitives/CounterStrip";
import { GraphNode, type GraphNodeTier } from "../../primitives/GraphNode";
import { MaskReveal } from "../../primitives/MaskReveal";
import { MotionLine } from "../../primitives/MotionLine";
import { NDJSONTape } from "../../primitives/NDJSONTape";
import { SlideShell } from "../../primitives/SlideShell";
import { useStaggeredFadeIn } from "../../primitives/useStaggeredFadeIn";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/**
 * Scene 6 — the closer. Training graph reverses the Scene-4a SPRING_HERO
 * zoom (use #2 of 2), settling at scale 0.4 in the upper band. An NDJSON
 * ticker slides in right; a Postgres ledger reveals 6 count-up cards below.
 * Three phase silhouettes replay in parallel (staggered beads). The serif
 * closer lands — italicized, with a Miami-red underline under "shell". A
 * final 3-value telemetry pill drops, then fade-to-black.
 *
 * Total: 2760f / 46s.
 */
const PHASES = [
  90, // 0: reverse SPRING_HERO pullback
  90, // 1: NDJSON ticker slide-in
  210, // 2: ledger title + Miami divider
  210, // 3: ledger 6 cards stagger
  300, // 4: count-ups fire (ramp per card)
  300, // 5: ledger caption
  240, // 6: phase silhouettes fade in
  480, // 7: 3-phase parallel beads
  60, // 8: ending halos
  240, // 9: serif closer MaskReveal + Miami underline
  120, // 10: final telemetry pill
  420, // 11: fade to black + terminal hold
] as const;

type TwelvePhases = [
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
  PhaseInfo,
];

const NODE_TIER: Record<string, GraphNodeTier> = {
  answer: "text",
  configure_experiment: "text",
  propose_model: "text",
  generate_code: "llm_delegated",
  write_code: "deterministic",
  execute_training: "deterministic",
  evaluate_results: "deterministic",
  await_review: "text",
  register_model: "action",
  summarize: "text",
};

const EDGES: Array<[string, string]> = [
  ["answer", "configure_experiment"],
  ["configure_experiment", "propose_model"],
  ["propose_model", "generate_code"],
  ["generate_code", "write_code"],
  ["write_code", "execute_training"],
  ["execute_training", "evaluate_results"],
  ["evaluate_results", "await_review"],
  ["await_review", "register_model"],
  ["register_model", "summarize"],
];

export const ArchPullbackSlide: React.FC<SlideBodyProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [
    pPull,
    pTape,
    pDivider,
    pLedger,
    ,
    pCaption,
    pSilhouettes,
    pBeads,
    ,
    pSerif,
    pPill,
    pFade,
  ] = useTimeline([...PHASES]) as TwelvePhases;
  const c = COLORS[theme];

  // Reverse SPRING_HERO pullback: scale 1.0 → 0.4 across 90f.
  const pullProgress = spring({
    fps,
    frame: frame - pPull.start,
    config: SPRING_HERO,
    durationInFrames: 90,
  });
  const pullScale = interpolate(pullProgress, [0, 1], [1.0, 0.4], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Training graph centroid pulls back and shifts LEFT so the NDJSON ticker
  // (now right-anchored at x=1040) no longer crosses the scaled graph.
  // Target center: (SCENE6.trainingGraphFinal.x + w/2, y + h/2) = (550, 360).
  const gCentroidX = 960;
  const gCentroidY = 510;
  const pullTx = (550 - gCentroidX) * pullProgress;
  const pullTy = (360 - gCentroidY) * pullProgress;

  // NDJSON ticker — vertical list of recent events.
  const tapePills = NDJSON_EVENT_TYPES.map((t, i) => ({
    id: `ev-${i}`,
    label: t,
    enterFrame: pTape.start + i * 20,
    color: i % 2 === 0 ? ARCH_PALETTE.accentBlue : ARCH_PALETTE.successGreen,
  }));

  const tapeOpacity = interpolate(
    frame,
    [pTape.start, pTape.end],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // 3 phase silhouettes fade in together.
  const silhouetteItems = useStaggeredFadeIn(3, {
    step: 40,
    startDelay: pSilhouettes.start,
    translateY: 20,
    damping: 200,
  });

  // Serif closer progress (MaskReveal).
  const serifOpacity = interpolate(frame, [pSerif.start, pSerif.start + 48], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Unified "camera pulls back, demo recedes" fade. The closer enters at
  // pSerif.start (f=1980). We start receding demo-content 120f earlier
  // (during the "ending halos" phase) and complete 30f before the closer
  // enters — so the thesis lands on a quiet canvas. Applied to: training
  // graph, NDJSON ticker, section title, ledger divider + cards + caption,
  // and the (already offscreen) phase silhouettes for consistency.
  const demoRecedeOpacity = interpolate(
    frame,
    [pSerif.start - 120, pSerif.start - 30],
    [1, 0],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Final telemetry pill — SPRING_SETTLE for a calmer final feel.
  const pillProgress = spring({
    fps,
    frame: frame - pPill.start,
    config: SPRING_SETTLE,
    durationInFrames: 24,
  });
  const pillOpacity = interpolate(pillProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pillTy = interpolate(pillProgress, [0, 1], [60, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade-to-black. EASE_IN holds the image legible through most of the phase
  // and collapses to black in the final beats — cinematic late-fade instead
  // of a premature black hold. Duration 400 lands at frame 2740, leaving a
  // 20-frame pure-black tail before the composition boundary (2760).
  const blackOpacity = interpolate(
    frame,
    [pFade.start, pFade.start + 400],
    [0, 1],
    { easing: EASE_IN, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const g = SCENE4_5_TRAINING_GRAPH;

  return (
    <SlideShell theme={theme} eyebrow="THE LEDGER" divider footer>
      {/* Training graph wrapper — reverses the SPRING_HERO engage.
       *  Recedes with `demoRecedeOpacity` before the closer enters. */}
      <AbsoluteFill
        style={{
          transform: `translate(${pullTx}px, ${pullTy}px) scale(${pullScale})`,
          transformOrigin: `${gCentroidX}px ${gCentroidY}px`,
          pointerEvents: "none",
          opacity: demoRecedeOpacity,
        }}
      >
        {Object.entries(g.nodes).map(([id, pos]) => (
          <GraphNode
            key={id}
            x={pos.x}
            y={pos.y}
            w={220}
            h={72}
            label={id}
            tier={NODE_TIER[id] ?? "deterministic"}
            enterFrame={-60}
          />
        ))}
        {EDGES.map(([from, to]) => {
          const fp = g.nodes[from as keyof typeof g.nodes];
          const tp = g.nodes[to as keyof typeof g.nodes];
          return (
            <AgentEdge
              key={`${from}->${to}`}
              x1={fp.x + 220}
              y1={fp.y + 36}
              x2={tp.x}
              y2={tp.y + 36}
              drawStartFrame={-60}
              drawDurationFrames={1}
              color={ARCH_PALETTE.edge}
            />
          );
        })}
      </AbsoluteFill>

      {/* NDJSON ticker (upper-right). Multiplies in the global recede so it
       *  clears before the closer enters. */}
      <div
        style={{
          position: "absolute",
          left: SCENE6.ndjsonTicker.x,
          top: SCENE6.ndjsonTicker.y,
          width: SCENE6.ndjsonTicker.w,
          opacity: tapeOpacity * demoRecedeOpacity,
        }}
      >
        <div
          style={{
            ...MONOSPACE_FONT,
            fontSize: 14,
            fontWeight: 600,
            color: ARCH_PALETTE.mute,
            marginBottom: 12,
          }}
        >
          JSON events · stream
        </div>
        <NDJSONTape
          pills={tapePills}
          width={SCENE6.ndjsonTicker.w}
          height={42}
          orientation="vertical"
          pillWidth={400}
        />
      </div>

      {/* Ledger divider (Miami-red 2px). Recedes with the ledger strip so the
       *  closer and final pill land on a clean canvas. */}
      <div
        style={{
          position: "absolute",
          left: 96,
          top: SCENE6.ledger.y - 30,
          width: 1728,
          height: 2,
          opacity:
            interpolate(
              frame,
              [pDivider.start, pDivider.end],
              [0, 1],
              { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ) * demoRecedeOpacity,
        }}
      >
        <MotionLine
          x1={0}
          y1={0}
          x2={1728}
          y2={0}
          delay={pDivider.start}
          durationInFrames={60}
          color={ARCH_PALETTE.hairline}
          strokeWidth={1}
          svgWidth={1728}
          svgHeight={2}
        />
      </div>

      {/* 6-card Postgres ledger strip. Wrapped so the entire strip can recede
       *  together — without the cards, the final telemetry pill at y=860 is
       *  no longer stacked on top of the ledger at y=800-936. */}
      <div style={{ opacity: demoRecedeOpacity }}>
        <CounterStrip
          cells={LEDGER_TABLES.map((t) => ({ label: t.label, to: t.count }))}
          x={SCENE6.ledger.x0}
          y={SCENE6.ledger.y}
          cardW={SCENE6.ledger.cardW}
          cardH={SCENE6.ledger.cardH}
          gap={SCENE6.ledger.gap}
          startFrame={pLedger.start}
          staggerFrames={30}
          countUpOffsetFrames={48}
        />
      </div>

      {/* Ledger caption beneath the strip. Fades with the rest of the demo. */}
      <div
        style={{
          position: "absolute",
          left: SCENE6.ledger.x0,
          top: SCENE6.ledger.y + SCENE6.ledger.cardH + 20,
          ...MONOSPACE_FONT,
          fontSize: 14,
          color: ARCH_PALETTE.mute,
          opacity:
            interpolate(
              frame,
              [pCaption.start, pCaption.start + 36],
              [0, 1],
              { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ) * demoRecedeOpacity,
        }}
      >
        Every edge, one row.
      </div>

      {/* 3 phase silhouettes (40% scale); each silhouette is stylized as a
       *  small inline graph — represented here as a dot row to keep the LOC
       *  manageable while still communicating "three parallel phases". These
       *  already sit offscreen (y+1000 > 1080) but we multiply in the global
       *  recede so if the layout ever changes, they still clear the closer. */}
      {SCENE6.silhouettes.map((s, i) => (
        <div
          key={`silhouette-${i}`}
          style={{
            position: "absolute",
            left: s.x,
            top: s.y + 1000, // offscreen until explicitly revealed; overlap ledger
            width: s.w,
            height: s.h,
            opacity: (silhouetteItems[i]?.opacity ?? 0) * demoRecedeOpacity,
            transform: silhouetteItems[i]?.transform,
            pointerEvents: "none",
          }}
        >
          {/* 3 dot row for each silhouette — enough signal for the echo. */}
          <div
            style={{
              display: "flex",
              gap: 6,
              justifyContent: "center",
              marginTop: 8,
            }}
          >
            {Array.from({ length: 10 - i }).map((_, j) => (
              <div
                key={j}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background:
                    i === 0
                      ? ARCH_PALETTE.accentBlue
                      : i === 1
                        ? ARCH_PALETTE.successGreen
                        : ARCH_PALETTE.amber,
                  opacity: 0.4 + 0.6 * ((frame - pBeads.start - i * 30) > 0 ? 1 : 0),
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {/*
       * --- Closer choreography ------------------------------------------
       * The closer is the section's thesis. It should land on a quiet
       * canvas. In the 120 frames preceding pSerif.start (f=1980) we
       * `demoRecedeOpacity`-fade every piece of demo content — the
       * reverse-pullback training graph, the NDJSON ticker, the ledger
       * divider/strip/caption, the section title underneath, and the
       * (already offscreen) phase silhouettes. We DO NOT fade the
       * SlideShell chrome (eyebrow/divider/footer), the Miami-red
       * underline, the sub-closer, or the final telemetry pill — those
       * are part of the closer moment itself. The camera effectively
       * pulls back, the demo recedes, and only the thesis remains.
       * ----------------------------------------------------------------*/}

      {/* Serif closer — italic 44, with "shell" in accent blue. */}
      <div
        style={{
          position: "absolute",
          left: SCENE6.closer.x,
          top: SCENE6.closer.y,
          width: SCENE6.closer.w,
          textAlign: "center",
        }}
      >
        <MaskReveal delay={pSerif.start} durationInFrames={48}>
          <div
            style={{
              ...SERIF_FONT,
              fontSize: 44,
              letterSpacing: "-0.005em",
              color: ARCH_PALETTE.ink,
              opacity: serifOpacity,
              lineHeight: 1.1,
            }}
          >
            Probabilistic core.{" "}
            <span style={{ color: ARCH_PALETTE.accentBlue }}>
              Deterministic shell.
            </span>
          </div>
        </MaskReveal>
      </div>

      {/* Sub-serif — smaller. */}
      <div
        style={{
          position: "absolute",
          left: SCENE6.subCloser.x,
          top: SCENE6.subCloser.y,
          width: SCENE6.subCloser.w,
          textAlign: "center",
          ...SERIF_FONT,
          fontSize: 28,
          color: ARCH_PALETTE.mute,
          opacity: interpolate(
            frame,
            [pSerif.start + 90, pSerif.start + 150],
            [0, 1],
            { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      >
        That&apos;s how an agent becomes production software.
      </div>

      {/* Miami-red underline under "shell". */}
      <div
        style={{
          position: "absolute",
          left: 1150,
          top: 615,
          width: 180,
          height: 2,
        }}
      >
        <MotionLine
          x1={0}
          y1={0}
          x2={180}
          y2={0}
          delay={pSerif.start + 120}
          durationInFrames={60}
          color={ARCH_PALETTE.miamiRed}
          strokeWidth={2}
          svgWidth={180}
          svgHeight={2}
        />
      </div>

      {/* Final telemetry pill — 3 count-ups. */}
      <div
        style={{
          position: "absolute",
          left: SCENE6.telemetryPill.x,
          top: SCENE6.telemetryPill.y,
          width: SCENE6.telemetryPill.w,
          height: SCENE6.telemetryPill.h,
          background: c.BACKGROUND_ELEVATED,
          border: `1px solid ${ARCH_PALETTE.hairline}`,
          borderRadius: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          padding: "0 32px",
          opacity: pillOpacity,
          transform: `translateY(${pillTy}px)`,
        }}
      >
        {[
          { to: 29, label: "STAGES" },
          { to: 6, label: "LEDGER TABLES" },
          { to: 1, label: "REGISTERED MODEL" },
        ].map((stat, i) => (
          <div
            key={stat.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                color: ARCH_PALETTE.ink,
              }}
            >
              <CountUpNumber
                from={0}
                to={stat.to}
                format={(n) => Math.round(n).toString()}
                delay={pPill.start + i * 12}
                durationInFrames={30}
              />
            </div>
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: ARCH_PALETTE.mute,
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Fade to black overlay. */}
      <AbsoluteFill
        style={{
          background: "#000",
          opacity: blackOpacity,
          pointerEvents: "none",
        }}
      />

      {/* Section title above graph (fades in early, then recedes with the
       *  rest of the demo — it sits at y=680 which is in the sub-closer band). */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 680,
          ...TITLE_FONT,
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: tapeOpacity * demoRecedeOpacity,
        }}
      >
        Everything the agent does — written down twice.
      </div>
    </SlideShell>
  );
};
