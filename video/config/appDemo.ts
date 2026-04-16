import type { AppTimelineEvent, SelectableScene } from "./scenes";

export type AppDemoPreset =
  | "ingest"
  | "explore"
  | "preprocess"
  | "engineer"
  | "train"
  | "experiments"
  | "deploy";

export type RelativeCursorMove = {
  xPct: number;
  yPct: number;
  delayMs?: number;
  click?: boolean;
};

export type AppDemoPhase = {
  preset: AppDemoPreset;
  phaseSlug:
    | "upload"
    | "data-viewer"
    | "preprocessing"
    | "feature-engineering"
    | "training"
    | "experiments"
    | "deployment";
  chapter: string;
  videoFile: `${AppDemoPreset}.webm`;
  durationInFrames: number;
  browserUrl: string;
  cursorMoves: readonly RelativeCursorMove[];
};

const APP_CAPTURE_SIZE = {
  width: 1600,
  height: 1000,
} as const;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const pointInSource = (xPct: number, yPct: number) => ({
  x: Math.round(clamp(xPct, 0, 1) * APP_CAPTURE_SIZE.width),
  y: Math.round(clamp(yPct, 0, 1) * APP_CAPTURE_SIZE.height),
});

const focusRect = (xPct: number, yPct: number, w = 340, h = 180) => {
  const point = pointInSource(xPct, yPct);
  return {
    x: clamp(point.x - Math.round(w / 2), 0, APP_CAPTURE_SIZE.width - w),
    y: clamp(point.y - Math.round(h / 2), 0, APP_CAPTURE_SIZE.height - h),
    w,
    h,
  };
};

const msToFrames = (ms: number): number =>
  Math.max(0, Math.round((ms / 1000) * 60));

const buildCursorTimeline = (
  phaseId: AppDemoPreset,
  moves: readonly RelativeCursorMove[],
): AppTimelineEvent[] => {
  const cursorEvents: AppTimelineEvent[] = [];
  let frameCursor = 18;

  moves.forEach((move, index) => {
    if (index > 0) {
      frameCursor += msToFrames(move.delayMs ?? 450);
    }

    const point = pointInSource(move.xPct, move.yPct);
    cursorEvents.push({
      id: `${phaseId}-cursor-${index}`,
      start: frameCursor,
      kind: "cursorTo",
      payload: point,
    });

    if (move.click) {
      cursorEvents.push({
        id: `${phaseId}-click-${index}`,
        start: frameCursor,
        kind: "click",
        payload: point,
      });
    }
  });

  return cursorEvents;
};

const baseZoom = (
  phaseId: AppDemoPreset,
  xPct: number,
  yPct: number,
  durationFrames = 72,
): AppTimelineEvent => ({
  id: `${phaseId}-zoom`,
  start: 12,
  kind: "zoom",
  durationFrames,
  payload: {
    ...focusRect(xPct, yPct, 520, 260),
    scale: 1.18,
  },
});

const phaseOverlays: Record<AppDemoPreset, AppTimelineEvent[]> = {
  ingest: [
    baseZoom("ingest", 0.72, 0.35),
    {
      id: "ingest-type",
      start: 26,
      kind: "type",
      durationFrames: 92,
      payload: {
        title: "Project brief",
        text: "Analyze this retention dataset and outline the fastest path to a deployable churn-risk model.",
        side: "left",
        region: focusRect(0.72, 0.35, 420, 190),
      },
    },
    {
      id: "ingest-llm",
      start: 88,
      kind: "llmToken",
      durationFrames: 108,
      payload: {
        title: "Plan approved",
        model: "GPT-5.4",
        text: "I found a clean churn-label dataset and drafted a seven-phase workflow from audit to deployment.",
        side: "left",
      },
    },
  ],
  explore: [
    baseZoom("explore", 0.73, 0.31),
    {
      id: "explore-nav",
      start: 20,
      kind: "navigate",
      durationFrames: 74,
      payload: {
        label: "Ask your data",
        detail: "Natural-language SQL",
      },
    },
    {
      id: "explore-tool",
      start: 70,
      kind: "toolCall",
      durationFrames: 96,
      payload: {
        tool: "compile_query",
        summary:
          "Generating SQL and a high-risk customer slice from the NovaCraft customers table.",
        tags: ["SQL", "artifact", "table"],
        side: "left",
      },
    },
  ],
  preprocess: [
    baseZoom("preprocess", 0.64, 0.28),
    {
      id: "preprocess-tool",
      start: 24,
      kind: "toolCall",
      durationFrames: 96,
      payload: {
        tool: "commit_transformation_step",
        summary:
          "Fill sparse adoption scores and winsorize extreme spend outliers while preserving row counts.",
        tags: ["clean", "replay-safe", "validated"],
      },
    },
    {
      id: "preprocess-assemble",
      start: 92,
      kind: "assemble",
      durationFrames: 100,
      payload: {
        title: "Applied transformations",
        items: [
          "Fill adoption_score nulls",
          "Clip extreme monthly_spend values",
          "Preserve churn label + row count",
        ],
        side: "left",
      },
    },
  ],
  engineer: [
    baseZoom("engineer", 0.37, 0.28),
    {
      id: "engineer-assemble",
      start: 24,
      kind: "assemble",
      durationFrames: 106,
      payload: {
        title: "Feature set",
        items: ["support_ticket_velocity", "expansion_ratio"],
      },
    },
    {
      id: "engineer-llm",
      start: 92,
      kind: "llmToken",
      durationFrames: 102,
      payload: {
        title: "Feature notebook",
        model: "GPT-5.4",
        text: "Registered two explainable churn features that improved ranking power without overcomplicating the pipeline.",
        side: "left",
      },
    },
  ],
  train: [
    baseZoom("train", 0.61, 0.3),
    {
      id: "train-tool",
      start: 22,
      kind: "toolCall",
      durationFrames: 96,
      payload: {
        tool: "register_model",
        summary:
          "Training NovaForest and XGBoost candidates, then promoting the strongest validation run.",
        tags: ["classification", "F1", "champion"],
      },
    },
    {
      id: "train-llm",
      start: 96,
      kind: "llmToken",
      durationFrames: 116,
      payload: {
        title: "Champion selected",
        model: "NovaForest",
        text: "Champion: NovaForest Classifier with F1 0.8424, precision 0.8611, and recall 0.8245.",
        side: "left",
      },
    },
  ],
  experiments: [
    baseZoom("experiments", 0.32, 0.31),
    {
      id: "experiments-scroll",
      start: 20,
      kind: "scrollTo",
      durationFrames: 80,
      payload: {
        label: "Leaderboard",
        detail: "Compare champion vs backup",
        from: 0.2,
        to: 0.76,
      },
    },
    {
      id: "experiments-nav",
      start: 84,
      kind: "navigate",
      durationFrames: 72,
      payload: {
        label: "Comparison mode",
        detail: "NovaForest vs XGBoost",
      },
    },
  ],
  deploy: [
    baseZoom("deploy", 0.77, 0.28),
    {
      id: "deploy-tool",
      start: 24,
      kind: "toolCall",
      durationFrames: 92,
      payload: {
        tool: "promote_deployment",
        summary:
          "Creating the production endpoint and waiting for health to stabilize.",
        tags: ["endpoint", "monitoring", "healthy"],
        side: "left",
      },
    },
    {
      id: "deploy-nav",
      start: 92,
      kind: "navigate",
      durationFrames: 94,
      payload: {
        label: "Deployment healthy",
        detail: "api.agentic.dev/v1/deployments/churn-champion",
      },
    },
  ],
};

const createAppDemoScene = (phase: AppDemoPhase): SelectableScene => ({
  type: "demo",
  chapter: phase.chapter,
  videoFile: phase.videoFile,
  videoRoot: "captures",
  cursorFile: phase.videoFile.replace(/\.webm$/i, ".cursor.json"),
  chrome: "none",
  url: phase.browserUrl,
  startOffset: 0,
  endOffset: 0,
  durationInFrames: phase.durationInFrames,
  timeline: [
    ...buildCursorTimeline(phase.preset, phase.cursorMoves),
    ...phaseOverlays[phase.preset],
  ],
});

export const APP_DEMO_PHASES: readonly AppDemoPhase[] = [
  {
    preset: "ingest",
    phaseSlug: "upload",
    chapter: "Upload",
    videoFile: "ingest.webm",
    durationInFrames: 480,
    browserUrl: "app.agentic-automl.dev/project/novacraft-growth/upload",
    cursorMoves: [
      { xPct: 0.71, yPct: 0.34, click: true },
      { xPct: 0.78, yPct: 0.58, delayMs: 900 },
      { xPct: 0.68, yPct: 0.24, delayMs: 1700 },
    ],
  },
  {
    preset: "explore",
    phaseSlug: "data-viewer",
    chapter: "Explore",
    videoFile: "explore.webm",
    durationInFrames: 450,
    browserUrl: "app.agentic-automl.dev/project/novacraft-growth/data-viewer",
    cursorMoves: [
      { xPct: 0.74, yPct: 0.3, click: true },
      { xPct: 0.72, yPct: 0.57, delayMs: 800 },
      { xPct: 0.31, yPct: 0.17, delayMs: 1600 },
    ],
  },
  {
    preset: "preprocess",
    phaseSlug: "preprocessing",
    chapter: "Preprocess",
    videoFile: "preprocess.webm",
    durationInFrames: 420,
    browserUrl:
      "app.agentic-automl.dev/project/novacraft-growth/preprocessing",
    cursorMoves: [
      { xPct: 0.64, yPct: 0.28, click: true },
      { xPct: 0.33, yPct: 0.36, delayMs: 900 },
      { xPct: 0.74, yPct: 0.26, delayMs: 1800 },
    ],
  },
  {
    preset: "engineer",
    phaseSlug: "feature-engineering",
    chapter: "Features",
    videoFile: "engineer.webm",
    durationInFrames: 420,
    browserUrl:
      "app.agentic-automl.dev/project/novacraft-growth/feature-engineering",
    cursorMoves: [
      { xPct: 0.37, yPct: 0.28, click: true },
      { xPct: 0.35, yPct: 0.54, delayMs: 900 },
      { xPct: 0.72, yPct: 0.62, delayMs: 1800 },
    ],
  },
  {
    preset: "train",
    phaseSlug: "training",
    chapter: "Train",
    videoFile: "train.webm",
    durationInFrames: 480,
    browserUrl: "app.agentic-automl.dev/project/novacraft-growth/training",
    cursorMoves: [
      { xPct: 0.61, yPct: 0.3, click: true },
      { xPct: 0.68, yPct: 0.62, delayMs: 1000 },
      { xPct: 0.33, yPct: 0.2, delayMs: 2100 },
    ],
  },
  {
    preset: "experiments",
    phaseSlug: "experiments",
    chapter: "Experiments",
    videoFile: "experiments.webm",
    durationInFrames: 360,
    browserUrl:
      "app.agentic-automl.dev/project/novacraft-growth/experiments",
    cursorMoves: [
      { xPct: 0.32, yPct: 0.31, click: true },
      { xPct: 0.51, yPct: 0.34, delayMs: 700 },
      { xPct: 0.77, yPct: 0.27, delayMs: 1400 },
    ],
  },
  {
    preset: "deploy",
    phaseSlug: "deployment",
    chapter: "Deployment",
    videoFile: "deploy.webm",
    durationInFrames: 360,
    browserUrl: "app.agentic-automl.dev/project/novacraft-growth/deployment",
    cursorMoves: [
      { xPct: 0.77, yPct: 0.28, click: true },
      { xPct: 0.67, yPct: 0.43, delayMs: 800 },
      { xPct: 0.76, yPct: 0.65, delayMs: 1500 },
    ],
  },
] as const;

export const APP_DEMO_PRESETS = APP_DEMO_PHASES.map(
  (phase) => phase.preset,
) as readonly AppDemoPreset[];

export const APP_DEMO_SCENES_BY_PRESET = Object.fromEntries(
  APP_DEMO_PHASES.map((phase) => [
    phase.preset,
    [createAppDemoScene(phase)],
  ]),
) as Record<AppDemoPreset, SelectableScene[]>;

export const APP_DEMO_SCENES: SelectableScene[] = APP_DEMO_PRESETS.flatMap(
  (preset) => APP_DEMO_SCENES_BY_PRESET[preset],
);

export const APP_DEMO_COMPOSITION_ID = "app-demo";

export const appDemoPhaseCompositionId = (
  preset: AppDemoPreset,
): `app-demo-${AppDemoPreset}` => `app-demo-${preset}`;

export type AppDemoCompositionId =
  | typeof APP_DEMO_COMPOSITION_ID
  | ReturnType<typeof appDemoPhaseCompositionId>;

export type AppDemoComposition = {
  id: AppDemoCompositionId;
  title: string;
  presets: readonly AppDemoPreset[];
  scenes: SelectableScene[];
  outputBasename: string;
};

export const APP_DEMO_COMPOSITIONS: readonly AppDemoComposition[] = [
  {
    id: APP_DEMO_COMPOSITION_ID,
    title: "App Demo",
    presets: APP_DEMO_PRESETS,
    scenes: APP_DEMO_SCENES,
    outputBasename: "full",
  },
  ...APP_DEMO_PHASES.map((phase) => ({
    id: appDemoPhaseCompositionId(phase.preset),
    title: `App Demo — ${phase.chapter}`,
    presets: [phase.preset],
    scenes: APP_DEMO_SCENES_BY_PRESET[phase.preset],
    outputBasename: phase.preset,
  })),
];

export const getAppDemoScenesForPresets = (
  presets: readonly AppDemoPreset[],
): SelectableScene[] => presets.flatMap((preset) => APP_DEMO_SCENES_BY_PRESET[preset]);
