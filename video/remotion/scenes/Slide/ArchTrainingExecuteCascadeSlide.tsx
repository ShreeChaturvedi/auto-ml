import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "../../../config/easing";
import { MONOSPACE_FONT, TITLE_FONT } from "../../../config/fonts";
import {
  ARCH_PALETTE,
  SCENE4_5_TRAINING_GRAPH,
  SCENE5_CODE_SEGMENT_CARDS,
  SCENE5_NOTEBOOK,
  SCENE5_PARSE_SHIKI,
  SCENE5_RETRY,
  SCENE5_TERMINAL,
  hEdgeCoords,
} from "../../../config/arch-layout";
import {
  SNIPPET_PARSE_TRAIN_COMPLETE,
  TRAIN_COMPLETE_MARKER_LINE,
  TRAINING_CODE_SEGMENTS,
} from "../../../config/arch-content";
import { COLORS } from "../../../config/themes";
import { AgentEdge } from "../../primitives/AgentEdge";
import { GraphNode, type GraphNodeTier } from "../../primitives/GraphNode";
import { MaskReveal } from "../../primitives/MaskReveal";
import { NDJSONTape } from "../../primitives/NDJSONTape";
import { NodeHaloRing } from "../../primitives/NodeHaloRing";
import { RetryCurve } from "../../primitives/RetryCurve";
import { SlideShell } from "../../primitives/SlideShell";
import { READING_RATE, TypeOnText } from "../../primitives/TypeOnText";
import { useShikiHighlight } from "../../primitives/useShikiHighlight";
import type { PhaseInfo } from "../../primitives/useTimeline";
import { useTimeline } from "../../primitives/useTimeline";
import type { SlideBodyProps } from "./index";

/**
 * Scene 5 — the HERO scene. 4320 frames / 72 seconds. Nine sub-beats that
 * trace the full execute_training → evaluate → register cascade with a
 * mid-scene FAIL → install_package → retry sequence at the center.
 *
 * Sub-beats (phase boundaries in a single useTimeline call):
 *   A  0–180    carry-match + zoom settle
 *   B  180–600  generate_code pulse + LLM chip
 *   C  600–1200 4 code-segment cards drop in
 *   D  1200–1800 write_code + notebook panel materializes
 *   E  1800–2160 execute_training FAIL + stderr typewriter
 *   F  2160–2520 RetryCurve + install_package pill
 *   G  2520–2880 re-run + stdout epochs
 *   H  2880–3480 __TRAIN_COMPLETE__ marker climax + parseTrainCompleteMetrics
 *   I  3480–4320 auto-cascade + NDJSON pills + hold on summarize
 */
const PHASES = [
  180, // A
  420, // B
  600, // C
  600, // D
  360, // E
  360, // F
  360, // G
  600, // H
  840, // I
] as const;

type NinePhases = [
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

// NDJSON auto-cascade pills timed relative to beat I (3480–4320).
const CASCADE_PILLS = [
  { id: "pill-1", label: "⚙ execute complete", color: "#3B82F6", offset: 0 },
  {
    id: "pill-2",
    label: "✓ evaluate complete",
    color: ARCH_PALETTE.successGreenBright,
    offset: 180,
  },
  {
    id: "pill-3",
    label: "📦 register_model v1",
    color: ARCH_PALETTE.amberBright,
    offset: 420,
  },
  {
    id: "pill-4",
    label: "workflow_state: completed",
    color: ARCH_PALETTE.successGreenBright,
    offset: 480,
  },
  {
    id: "pill-5",
    label: "artifact_updated",
    color: ARCH_PALETTE.successGreenBright,
    offset: 540,
  },
  {
    id: "pill-6",
    label: "done",
    color: ARCH_PALETTE.successGreenBright,
    offset: 600,
  },
];

export const ArchTrainingExecuteCascadeSlide: React.FC<SlideBodyProps> = ({
  theme,
}) => {
  const frame = useCurrentFrame();
  const [pA, pB, pC, pD, pE, pF, pG, pH, pI] = useTimeline([
    ...PHASES,
  ]) as NinePhases;
  const c = COLORS[theme];
  const g = SCENE4_5_TRAINING_GRAPH;

  const { html: parseShikiHtml } = useShikiHighlight({
    code: SNIPPET_PARSE_TRAIN_COMPLETE,
    lang: "ts",
    theme,
  });

  // Node status — progresses through the scene based on current beat.
  const statusOf = (id: string): "idle" | "active" | "retry" | "success" => {
    if (frame < pB.start) return "idle";
    if (id === "generate_code" && frame < pC.end) return "active";
    if (id === "write_code" && frame >= pD.start && frame < pE.start) return "active";
    if (id === "execute_training") {
      if (frame >= pE.start && frame < pF.start) return "retry"; // fail → amber
      if (frame >= pG.start && frame < pH.end) return "success";
    }
    if (id === "evaluate_results" && frame >= pH.end && frame < pI.start + 300) return "active";
    if (id === "register_model" && frame >= pI.start + 300 && frame < pI.end) return "success";
    if (id === "summarize" && frame >= pI.end - 180) return "active";
    return "idle";
  };

  // Marker highlight rect: draws from width 0 → 520 over 60f during beat H.
  const markerHighlightW = interpolate(
    frame,
    [pH.start + 132, pH.start + 192],
    [0, 520],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // lastIndexOf amber underline — draws during beat H (Shiki overlay).
  const lastIndexOfUnderlineProgress = interpolate(
    frame,
    [pH.start + 252, pH.start + 300],
    [0, 1],
    { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <SlideShell theme={theme} eyebrow="EXECUTE CASCADE" divider footer>
      {/* ---- 10-node training graph (always visible, status-driven) ---- */}
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
          status={statusOf(id)}
        />
      ))}

      {/* Edges — snake-aware via hEdgeCoords so row 2 (R→L) exits from the
          source's left and enters the target's right without crossing through
          intermediate node bodies (previously drew a strikethrough line across
          register_model on the await_review → register_model edge). */}
      {EDGES.map(([from, to]) => {
        const fp = g.nodes[from as keyof typeof g.nodes];
        const tp = g.nodes[to as keyof typeof g.nodes];
        const coords = hEdgeCoords(fp, tp);
        let beadStartFrame: number | undefined;
        if (from === "generate_code" && to === "write_code") {
          beadStartFrame = pC.end - 60;
        } else if (from === "write_code" && to === "execute_training") {
          beadStartFrame = pD.end - 60;
        } else if (from === "execute_training" && to === "evaluate_results") {
          beadStartFrame = pI.start + 20;
        } else if (from === "evaluate_results" && to === "await_review") {
          beadStartFrame = pI.start + 140;
        } else if (from === "await_review" && to === "register_model") {
          beadStartFrame = pI.start + 260;
        } else if (from === "register_model" && to === "summarize") {
          beadStartFrame = pI.start + 520;
        }
        return (
          <AgentEdge
            key={`${from}->${to}`}
            x1={coords.x1}
            y1={coords.y1}
            x2={coords.x2}
            y2={coords.y2}
            drawStartFrame={-60}
            drawDurationFrames={1}
            color={ARCH_PALETTE.edge}
            beadStartFrame={beadStartFrame}
            beadDurationFrames={80}
            beadColor={ARCH_PALETTE.accentBlue}
          />
        );
      })}

      {/* Halo on generate_code during beat B. */}
      <NodeHaloRing
        x={g.nodes.generate_code.x}
        y={g.nodes.generate_code.y}
        w={220}
        h={72}
        at={pB.start}
        durationFrames={60}
        color={ARCH_PALETTE.accentBlue}
      />

      {/* Halo on execute_training at failure (amber). */}
      <NodeHaloRing
        x={g.nodes.execute_training.x}
        y={g.nodes.execute_training.y}
        w={220}
        h={72}
        at={pE.start + 120}
        durationFrames={60}
        color={ARCH_PALETTE.amberBright}
      />

      {/* ---- Beat B — LLM chip + reasoning tokens ---- */}
      <div
        style={{
          position: "absolute",
          left: 1150,
          top: 240,
          opacity: interpolate(
            frame,
            [pB.start, pB.start + 24, pC.start, pC.start + 24],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      >
        <div
          style={{
            padding: "10px 20px",
            background: ARCH_PALETTE.paper,
            border: `1px solid ${ARCH_PALETTE.accentBlue}`,
            borderRadius: 999,
            ...MONOSPACE_FONT,
            fontSize: 13,
            fontWeight: 700,
            color: ARCH_PALETTE.accentBlue,
            letterSpacing: "0.08em",
          }}
        >
          MODEL · llm_delegated
        </div>
      </div>

      {/* ---- Beat C — 4 code-segment cards (horizontal bottom row) ---- */}
      {TRAINING_CODE_SEGMENTS.map((seg, i) => {
        const enterFrame = pC.start + i * 90;
        const cardOpacity = interpolate(
          frame,
          [enterFrame, enterFrame + 24, pD.end, pD.end + 60],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        return (
          <div
            key={seg.title}
            style={{
              position: "absolute",
              left: SCENE5_CODE_SEGMENT_CARDS.xs[i],
              top: SCENE5_CODE_SEGMENT_CARDS.y,
              width: SCENE5_CODE_SEGMENT_CARDS.w,
              height: SCENE5_CODE_SEGMENT_CARDS.h,
              background: c.BACKGROUND_ELEVATED,
              border: `1px solid ${ARCH_PALETTE.hairline}`,
              borderRadius: 12,
              boxShadow: "0 12px 32px -8px rgba(0,0,0,0.08)",
              padding: "18px 22px",
              opacity: cardOpacity,
            }}
          >
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 14,
                fontWeight: 600,
                color: ARCH_PALETTE.mute,
                marginBottom: 10,
              }}
            >
              {seg.title}
            </div>
            <MaskReveal
              delay={enterFrame + 12}
              durationInFrames={36}
              style={{
                ...MONOSPACE_FONT,
                fontSize: 14,
                lineHeight: 1.4,
                color: ARCH_PALETTE.ink,
                whiteSpace: "pre",
              }}
            >
              {seg.code}
            </MaskReveal>
          </div>
        );
      })}

      {/* ---- Beat D — notebook panel (mid-band, 4 cells in a row) ----
           Located between row 1 (y=360..432) and row 2 (y=660..732) so the
           panel never covers a graph node. Width stops at x=1180 so the
           Beat F RetryCurve + install_pill (x=1220..1640) stay visible. */}
      <div
        style={{
          position: "absolute",
          left: SCENE5_NOTEBOOK.panel.x,
          top: SCENE5_NOTEBOOK.panel.y,
          width: SCENE5_NOTEBOOK.panel.w,
          height: SCENE5_NOTEBOOK.panel.h,
          background: c.BACKGROUND_ELEVATED,
          border: `1px solid ${ARCH_PALETTE.hairline}`,
          borderRadius: 16,
          boxShadow: "0 30px 80px -12px rgba(0,0,0,0.20)",
          padding: "14px 16px",
          opacity: interpolate(
            frame,
            [pD.start, pD.start + 36, pH.start, pH.start + 36],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      >
        <div
          style={{
            ...MONOSPACE_FONT,
            fontSize: 13,
            fontWeight: 600,
            color: ARCH_PALETTE.mute,
            marginBottom: 8,
          }}
        >
          training_notebook.ipynb
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          {TRAINING_CODE_SEGMENTS.map((seg, i) => {
            const cellEnter = pD.start + i * 120;
            return (
              <div
                key={seg.title}
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  background: ARCH_PALETTE.paper,
                  border: `1px solid ${ARCH_PALETTE.hairline}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  opacity: interpolate(frame, [cellEnter, cellEnter + 24], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                <div
                  style={{
                    ...MONOSPACE_FONT,
                    fontSize: 12,
                    fontWeight: 600,
                    color: ARCH_PALETTE.accentBlue,
                    marginBottom: 4,
                  }}
                >
                  [{i + 1}] {seg.title.replace("# ", "")}
                </div>
                <div
                  style={{
                    ...MONOSPACE_FONT,
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: ARCH_PALETTE.ink,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {seg.code}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Beat E — terminal strip (FAIL) ---- */}
      <div
        style={{
          position: "absolute",
          left: SCENE5_TERMINAL.container.x,
          top: SCENE5_TERMINAL.container.y,
          width: SCENE5_TERMINAL.container.w,
          height: SCENE5_TERMINAL.container.h,
          background: frame >= pG.start
            ? ARCH_PALETTE.terminalBgTint
            : ARCH_PALETTE.terminalBg,
          border: `1px solid ${ARCH_PALETTE.ink2E}`,
          borderRadius: 20,
          padding: 20,
          opacity: interpolate(
            frame,
            [pE.start, pE.start + 24, pH.start, pH.start + 36],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* stderr traceback — 3 lines typed in via TypeOnText. */}
        <div
          style={{
            ...MONOSPACE_FONT,
            fontSize: 18,
            color: ARCH_PALETTE.amberBright,
            marginBottom: 4,
          }}
        >
          <TypeOnText
            text="Traceback (most recent call last):"
            rate={READING_RATE}
            delay={pE.start + 20}
            caret={false}
          />
        </div>
        <div
          style={{
            ...MONOSPACE_FONT,
            fontSize: 18,
            color: ARCH_PALETTE.amberBright,
            marginBottom: 4,
          }}
        >
          <TypeOnText
            text='  File "cell_4.py", line 2, in <module>'
            rate={READING_RATE}
            delay={pE.start + 100}
            caret={false}
          />
        </div>
        <div
          style={{
            ...MONOSPACE_FONT,
            fontSize: 18,
            fontWeight: 700,
            color: ARCH_PALETTE.redFlash,
          }}
        >
          <TypeOnText
            text="ModuleNotFoundError: No module named 'xgboost'"
            rate={READING_RATE}
            delay={pE.start + 180}
            caret={false}
          />
        </div>
        {/* Post-install, swap to green-tint epochs */}
        {frame >= pG.start ? (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 16,
                color: ARCH_PALETTE.successGreenBright,
              }}
            >
              <TypeOnText
                text="pip install xgboost ... ✓ collected xgboost-2.1.3"
                rate={READING_RATE}
                delay={pG.start + 20}
                caret={false}
              />
            </div>
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 16,
                color: "#E5E7EB",
                marginTop: 6,
              }}
            >
              <TypeOnText
                text="Epoch 1/10 — loss: 0.412 val_acc: 0.71"
                rate={READING_RATE}
                delay={pG.start + 120}
                caret={false}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* ---- Beat F — RetryCurve + install_package pill ---- */}
      {frame >= pF.start ? (
        <>
          <RetryCurve
            from={SCENE5_RETRY.curveStart}
            control={SCENE5_RETRY.curveControl}
            to={SCENE5_RETRY.curveEnd}
            drawStartFrame={pF.start}
            drawDurationFrames={120}
            beadStartFrame={pF.start + 80}
            beadDurationFrames={100}
            color={ARCH_PALETTE.amberBright}
          />
          <div
            style={{
              position: "absolute",
              left: SCENE5_RETRY.installPill.x,
              top: SCENE5_RETRY.installPill.y,
              width: SCENE5_RETRY.installPill.w,
              height: SCENE5_RETRY.installPill.h,
              background: ARCH_PALETTE.amberBright,
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              ...MONOSPACE_FONT,
              fontSize: 16,
              fontWeight: 700,
              color: "#FFF",
              opacity: interpolate(frame, [pF.start + 40, pF.start + 80], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            install_package — wf-auto-install-xgboost
          </div>
        </>
      ) : null}

      {/* ---- Beat H — __TRAIN_COMPLETE__ marker climax ---- */}
      {frame >= pH.start ? (
        <>
          {/* Yellow highlight backfill. */}
          <div
            style={{
              position: "absolute",
              left: 140,
              top: 870,
              width: markerHighlightW,
              height: 36,
              background: ARCH_PALETTE.markerHighlight,
              borderRadius: 4,
              pointerEvents: "none",
            }}
          />
          {/* Marker text typed at MARKER_RATE = 4f/char. */}
          <div
            style={{
              position: "absolute",
              left: 148,
              top: 872,
              ...MONOSPACE_FONT,
              fontSize: 20,
              fontWeight: 700,
              color: ARCH_PALETTE.markerGreen,
              letterSpacing: "0.02em",
            }}
          >
            <TypeOnText
              text={TRAIN_COMPLETE_MARKER_LINE}
              rate={4}
              delay={pH.start + 20}
              caret={false}
            />
          </div>

          {/* parseTrainCompleteMetrics Shiki panel — relocated to upper-LEFT
              (140, 220, 620, 260), above the training graph's row 1 at y=360.
              Prior placement at (1240, 140) overlapped the write_code and
              generate_code row-1 nodes; the upper-left band clears row 1
              entirely and sits under the section title. A fade-out at
              pI.start keeps the panel from occluding Beat I content. */}
          <div
            style={{
              position: "absolute",
              left: SCENE5_PARSE_SHIKI.panel.x,
              top: SCENE5_PARSE_SHIKI.panel.y,
              width: SCENE5_PARSE_SHIKI.panel.w,
              height: SCENE5_PARSE_SHIKI.panel.h,
              background: c.BACKGROUND_ELEVATED,
              border: `1px solid ${ARCH_PALETTE.hairline}`,
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 30px 80px -12px rgba(0,0,0,0.20)",
              opacity: interpolate(
                frame,
                [pH.start + 240, pH.start + 288, pI.start, pI.start + 60],
                [0, 1, 1, 0],
                { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              ),
            }}
          >
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 14,
                fontWeight: 600,
                color: ARCH_PALETTE.mute,
                marginBottom: 14,
              }}
            >
              training.ts · parseTrainCompleteMetrics
            </div>
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 14,
                lineHeight: 1.55,
                color: ARCH_PALETTE.ink,
                position: "relative",
              }}
            >
              {parseShikiHtml ? (
                <div dangerouslySetInnerHTML={{ __html: parseShikiHtml }} />
              ) : (
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                  {SNIPPET_PARSE_TRAIN_COMPLETE}
                </pre>
              )}
              {/* Amber underline under `lastIndexOf` token. */}
              <div
                style={{
                  position: "absolute",
                  left: SCENE5_PARSE_SHIKI.lastIndexOfToken.tokenX,
                  top: SCENE5_PARSE_SHIKI.lastIndexOfToken.tokenY +
                    SCENE5_PARSE_SHIKI.lastIndexOfToken.tokenH,
                  width:
                    SCENE5_PARSE_SHIKI.lastIndexOfToken.tokenW *
                    lastIndexOfUnderlineProgress,
                  height: 2,
                  background: ARCH_PALETTE.amberBright,
                  pointerEvents: "none",
                }}
              />
            </div>
            <div
              style={{
                ...MONOSPACE_FONT,
                fontSize: 14,
                color: ARCH_PALETTE.mute,
                marginTop: 18,
              }}
            >
              Last occurrence. Tolerates interim progress prints.
            </div>
          </div>
        </>
      ) : null}

      {/* ---- Beat I — auto-cascade NDJSON pills ----
           Tape shifted upward (top 700 → 620) to pull the pill column out of
           the bottom-gap that Beats C/D use for code cells. Pills still enter
           at tape top and scroll downward; at peak the oldest pill sits around
           y=860, leaving the final ~160px of canvas (y=860..1020) open. */}
      {frame >= pI.start ? (
        <div
          style={{
            position: "absolute",
            left: 1240,
            top: 620,
            width: 560,
          }}
        >
          <NDJSONTape
            pills={CASCADE_PILLS.map((p) => ({
              id: p.id,
              label: p.label,
              enterFrame: pI.start + p.offset,
              color: p.color,
            }))}
            width={560}
            height={42}
            orientation="vertical"
            pillWidth={360}
          />
        </div>
      ) : null}

      {/* Title (persistent, fades in at scene start). */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 232,
          ...TITLE_FONT,
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: c.WORD_COLOR_ON_BG_APPEARED,
          opacity: interpolate(frame, [pA.start, pA.end], [0, 1], {
            easing: EASE_OUT,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Generate. Run. Fail. Recover.
      </div>

      {/* Iteration counter (top-right during Beat E). */}
      {frame >= pE.start && frame < pI.start ? (
        <div
          style={{
            position: "absolute",
            right: 120,
            top: 792,
            ...MONOSPACE_FONT,
            fontSize: 14,
            color: ARCH_PALETTE.mute,
          }}
        >
          iteration:{" "}
          {Math.max(1, Math.min(9, Math.floor((frame - pE.start) / 80) + 5))}
        </div>
      ) : null}
    </SlideShell>
  );
};
