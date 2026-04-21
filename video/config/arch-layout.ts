/**
 * Shared pixel-coordinate constants for the 8-slide architecture section.
 *
 * Keeping these centralized makes it easy to verify safe-area compliance
 * (nothing past `x = 1920 - 32` / `y = 1080 - 32`) and to update positioning
 * without hunting through 8 scene files.
 */

// Composition extents — mirrors DIMENSIONS.landscape.
export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

// Safe-area guards (32px padding from canvas edge).
export const SAFE_RIGHT_X = CANVAS_W - 32; // 1888
export const SAFE_BOTTOM_Y = CANVAS_H - 32; // 1048

// ---- Graph node geometry --------------------------------------------------

export const GRAPH_NODE = {
  width: 220,
  height: 72,
  radius: 12,
  /** Border stroke for the idle (deterministic) tier. */
  strokeWidth: 1.5,
} as const;

// ---- Scene 2 — 6-node engine + 1 START sentinel -----------------------------

export const SCENE2_ENGINE = {
  // Row 1: START → prepare → invoke_model → execute_tools
  rowTopY: 332,
  // Row 2 fan-out (pause, complete, fail)
  rowFanY: 684,
  // Column positions (node.x, node.y) — node width 220, height 72.
  nodes: {
    start: { x: 150, y: 332 },
    prepare: { x: 396, y: 332 },
    invoke_model: { x: 642, y: 332 },
    execute_tools: { x: 888, y: 332 },
    pause: { x: 410, y: 684 },
    complete: { x: 656, y: 684 },
    fail: { x: 902, y: 684 },
  },
  // Right-side Shiki panel (graph.ts)
  shiki: { x: 1140, y: 260, w: 680, h: 500 },
} as const;

// ---- Scene 3 — 3 phase cards + scaled engine + allowlist Shiki -------------

export const SCENE3 = {
  scaledEngineScale: 0.6,
  // 3 phase cards at y=760
  cards: {
    y: 760,
    w: 400,
    h: 160,
    gap: 200, // x-stride: card(400) + gap(200) = 600
    x0: 160, // preprocessing card
    x1: 760, // feature engineering card
    x2: 1360, // training card
  },
  // STAGE_TOOL_ALLOWLIST Shiki panel — right panel, tightened to x=1120
  shiki: { x: 1120, y: 260, w: 664, h: 360 },
} as const;

// ---- Scene 4 / 5 — 10-node training graph -----------------------------------

export const SCENE4_5_TRAINING_GRAPH = {
  row1Y: 360,
  row2Y: 660,
  columns: [150, 470, 790, 1110, 1430] as const,
  // Node id → position map. Row 2 is a boustrophedon (right→left) so the
  // graph reads as a snake: row 1 goes L→R, then row 2 flows back R→L ending
  // at `summarize` on the left. `hEdgeCoords` below handles the side swap
  // transparently for any edge whose target is to the LEFT of its source.
  nodes: {
    answer: { x: 150, y: 360 },
    configure_experiment: { x: 470, y: 360 },
    propose_model: { x: 790, y: 360 },
    generate_code: { x: 1110, y: 360 },
    write_code: { x: 1430, y: 360 },
    execute_training: { x: 1430, y: 660 },
    evaluate_results: { x: 1110, y: 660 },
    await_review: { x: 790, y: 660 },
    register_model: { x: 470, y: 660 },
    summarize: { x: 150, y: 660 },
  },
  // Tool-call cards in the BOTTOM GAP (Scene 4a) — side-by-side below the
  // graph. Previously anchored to the upper right at x=1244, which meant the
  // card bodies horizontally collided with `generate_code` (x=1110..1330) and
  // `write_code` (x=1430..1650) on row 1, occluding the rightmost two nodes.
  // Bottom-gap placement keeps both the graph and the callouts fully legible:
  // y=770 sits 38px below row 2 (ends y=732), y=970 leaves 50px to the footer.
  toolCallCard1: { x: 140, y: 770, w: 544, h: 200 },
  toolCallCard2: { x: 1060, y: 770, w: 556, h: 200 },
  // Scene 4s approval overlay — halo & labels
  approval: {
    halo: { x: 790, y: 360, w: 220, h: 72 },
    labelBox: { x: 360, y: 472, w: 1200, h: 112 },
    subLabel: { x: 360, y: 600, w: 1200, h: 24 },
    labelHalo: { x: 360, y: 472, w: 1200, h: 112 },
  },
  // Scene 4b approval bubble
  approvalBubble: { x: 1244, y: 220, w: 544, h: 120 },
} as const;

// ---- Scene 5 Beat C — 4 code-segment cards (screen-space overlay) ---------
//
// Reflow: cards used to stack vertically on the LEFT (x=140, y=[300..780])
// which occluded both rows of graph nodes AND the terminal strip. Now the
// cards sit in a single horizontal row anchored to the BOTTOM GAP so they
// stay clear of nodes (rows at y=360..432 and y=660..732) and remain below
// the install_pill retry curve (y≤774). Each card keeps the same 140px
// height so the MaskReveal timing is unchanged.

export const SCENE5_CODE_SEGMENT_CARDS = {
  /** Per-card left coords for the 4 horizontally-arranged cards. */
  xs: [140, 570, 1000, 1430],
  /** All cards share the same top (bottom-gap row). */
  y: 870,
  w: 400,
  h: 140,
  captionY: 940,
} as const;

// ---- Scene 5 Beat D — notebook panel --------------------------------------
//
// Reflow: notebook used to hug the RIGHT column (x=1240..1780, y=140..820)
// which covered generate_code, write_code, register_model, and summarize
// nodes on the right of both rows. Now the panel is a wide mid-band strip
// that lives between the two node rows (y=432..660 is clear of nodes), and
// stops at x=1180 so the RetryCurve + install_pill (x=1220..1640) during
// Beat F remain fully visible.

export const SCENE5_NOTEBOOK = {
  panel: { x: 140, y: 448, w: 1040, h: 204 },
  cells: [
    { x: 152, y: 492, w: 241, h: 148 },
    { x: 405, y: 492, w: 241, h: 148 },
    { x: 658, y: 492, w: 241, h: 148 },
    { x: 911, y: 492, w: 241, h: 148 },
  ],
} as const;

// ---- Scene 5 Beats E–G — terminal strip -----------------------------------

export const SCENE5_TERMINAL = {
  container: { x: 140, y: 820, w: 1080, h: 140 },
  iterationHud: { x: 140, y: 792, w: 200, h: 24 },
} as const;

// ---- Scene 5 Beat F — retry curve + install_package pill -------------------

export const SCENE5_RETRY = {
  curveStart: { x: 1220, y: 660 },
  curveEnd: { x: 1220, y: 820 },
  curveControl: { x: 1400, y: 740 },
  installPill: { x: 1220, y: 790, w: 420, h: 44 },
  attemptChip: { x: 1400, y: 640, w: 140, h: 28 },
} as const;

// ---- Scene 5 Beat H — parseTrainCompleteMetrics Shiki panel ---------------

export const SCENE5_PARSE_SHIKI = {
  panel: { x: 140, y: 220, w: 620, h: 260 },
  title: { x: 140, y: 220, w: 620, h: 40 },
  body: { x: 140, y: 260, w: 620, h: 220 },
  caption: { x: 140, y: 492, w: 620, h: 24 },
  // Pre-measured coordinates for the amber `lastIndexOf` underline overlay.
  lastIndexOfToken: { tokenX: 240, tokenY: 96, tokenW: 108, tokenH: 22 },
} as const;

// ---- Scene 6 — pullback layout --------------------------------------------

export const SCENE6 = {
  // Training graph wrapper final position after pullback (scale 0.4).
  // Narrowed + left-anchored so the NDJSON ticker no longer crosses nodes.
  trainingGraphFinal: { x: 120, y: 220, w: 860, h: 280 },
  // NDJSON ticker — right-anchored, clears the scaled training graph at x<=980.
  ndjsonTicker: { x: 1040, y: 220, w: 760, h: 420 },
  // Postgres ledger cards (6 in a row)
  ledger: {
    y: 800,
    cardW: 260,
    cardH: 136,
    gap: 30, // x-stride: 260 + 30 = 290
    x0: 120,
  },
  // 3 phase silhouettes (parallel echo)
  silhouettes: [
    { x: 120, y: 200, w: 520, h: 400 },
    { x: 700, y: 200, w: 520, h: 400 },
    { x: 1280, y: 200, w: 520, h: 400 },
  ],
  // Final serif closer
  closer: { x: 120, y: 528, w: 1704, h: 96 },
  subCloser: { x: 120, y: 660, w: 1704, h: 40 },
  // Final telemetry pill
  telemetryPill: { x: 640, y: 860, w: 640, h: 80 },
} as const;

// ---- Palette tokens (frozen for this section) -----------------------------

export const ARCH_PALETTE = {
  ink: "#171717",
  mute: "rgba(23,23,23,0.55)",
  /** Foreground-muted for tool-card bodies — same visual weight as `mute`,
   *  but named explicitly so card primitives don't have to guess which
   *  palette token to reach for. */
  muteFg: "rgba(23,23,23,0.55)",
  paper: "#FFFFFF",
  paperAlt: "#FAFAFA",
  hairline: "#E5E5E5",
  accentBlue: "#1D4ED8",
  accentBlueDeep: "#1E3A8A", // blue-900, for primary text that must read over paper
  successGreen: "#16A34A",
  successGreenBright: "#10B981",
  amber: "#D97706",
  amberBright: "#F59E0B",
  redFlash: "#F87171",
  miamiRed: "#C41230",
  ink2E: "#2E2E2E", // terminal border
  terminalBg: "#0A0A0A",
  terminalBgTint: "rgba(34,197,94,0.06)",
  markerGreen: "#22C55E",
  markerHighlight: "rgba(254,240,138,0.75)",
  llmNodeRing: "rgba(29,78,216,0.15)",
  amberTint: "rgba(217,119,6,0.14)",
  // Default edge stroke — distinctly visible on paper without becoming UI chrome.
  edge: "#9CA3AF",        // neutral-400; renders as confident grey on #FFFFFF
  edgeStrong: "#6B7280",  // neutral-500; for accent edges on focused beats
} as const;

// ---- Cosine constants -----------------------------------------------------

export const SHIMMER_PERIOD_FRAMES = 120;
export const BREATHE_PERIOD_FRAMES = 120;

/** Snake-aware horizontal edge endpoints. Returns line-start/end coords given
 *  two graph nodes' top-left positions. If the target is to the LEFT of the
 *  source (row 2 boustrophedon), exit from source's left and enter target's
 *  right; otherwise standard left-to-right. Node width is fixed at 220;
 *  vertical center is y+36 (half of 72). */
export const hEdgeCoords = (
  fp: { x: number; y: number },
  tp: { x: number; y: number },
) => {
  if (fp.x > tp.x) {
    return { x1: fp.x, y1: fp.y + 36, x2: tp.x + 220, y2: tp.y + 36 };
  }
  return { x1: fp.x + 220, y1: fp.y + 36, x2: tp.x, y2: tp.y + 36 };
};
