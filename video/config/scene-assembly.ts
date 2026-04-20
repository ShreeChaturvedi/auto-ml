import { APP_DEMO_SCENES } from "./appDemo";
import type { SelectableScene } from "./scenes";

type SlideScene = Extract<SelectableScene, { type: "slide" }>;
type DemoScene = Extract<SelectableScene, { type: "demo" }>;
type UrlIntroScene = Extract<SelectableScene, { type: "urlIntro" }>;

export type AgendaChapter = {
  title: string;
  timestamp: string;
  accent?: boolean;
};

export const DEFAULT_AGENDA_CHAPTERS: AgendaChapter[] = [
  { title: "Upload & Project Planning", timestamp: "02:05" },
  {
    title: "Data Exploration — EDA + Natural-Language SQL",
    timestamp: "04:40",
  },
  {
    title: "Preprocessing — the LangGraph finite state machine",
    timestamp: "08:10",
    accent: true,
  },
  { title: "Feature Engineering", timestamp: "12:05" },
  { title: "Training — sandboxed Docker notebooks", timestamp: "14:20" },
  { title: "Experiments & Leaderboard", timestamp: "17:05" },
  { title: "What's Next", timestamp: "19:40" },
];

const INTRO_SLIDES: SlideScene[] = [
  { type: "slide", id: "title", durationInFrames: 540 },
  { type: "slide", id: "hook", durationInFrames: 720 },
  { type: "slide", id: "team", durationInFrames: 840 },
  { type: "slide", id: "acknowledgements", durationInFrames: 780 },
  { type: "slide", id: "problem-trio", durationInFrames: 2040 },
  { type: "slide", id: "why-now", durationInFrames: 1440 },
  {
    type: "slide",
    id: "agenda",
    durationInFrames: 1620,
    meta: { chapters: DEFAULT_AGENDA_CHAPTERS },
  },
];

const INTRO_DEMO_BEATS: SelectableScene[] = [
  {
    type: "urlIntro",
    url: "agentic-automl.vercel.app",
    backgroundAsset: "backgrounds/newtab-bg.webp",
    durationInFrames: 330,
  } satisfies UrlIntroScene,
  {
    type: "demo",
    videoFile: "landing-recorded.mp4",
    videoRoot: "captures",
    chrome: "browser",
    url: "agentic-automl.vercel.app",
    durationInFrames: 4518,
    startOffset: 0,
    endOffset: 0,
    chromeDismissAt: 12,
    chromeDismissDurationFrames: 45,
    chromeRestoreAtEnd: true,
    chromeRestoreDurationFrames: 45,
    chromeRestoreHoldFrames: 0,
  } satisfies DemoScene,
  {
    type: "demo",
    videoFile: "signup.webm",
    videoRoot: "captures",
    cursorFile: "signup.cursor.json",
    chrome: "browser",
    url: "app.agentic-automl.dev/signup",
    voiceoverFile: "scene-signup.mp3",
    durationInFrames: 1500,
    startOffset: 0.8,
    endOffset: 6.4,
    chromeDismissAt: 8,
    chromeDismissDurationFrames: 36,
    chromeRestoreAtEnd: true,
    chromeRestoreDurationFrames: 45,
    chromeRestoreHoldFrames: 36,
  } satisfies DemoScene,
  {
    type: "demo",
    videoFile: "signup-gmail.webm",
    videoRoot: "captures",
    cursorFile: "signup-gmail.cursor.json",
    chrome: "browser",
    url: "mail.google.com/mail/u/0/#inbox",
    tabs: [
      { title: "Sign up | Agentic AutoML", active: false },
      { title: "Inbox (1) - Gmail", active: true, appearFrame: 6 },
    ],
    durationInFrames: 900,
    startOffset: 0,
    endOffset: 0,
  } satisfies DemoScene,
  {
    type: "demo",
    videoFile: "home.webm",
    videoRoot: "captures",
    cursorFile: "home.cursor.json",
    chrome: "mac",
    mediaAlignX: "left",
    voiceoverFile: "scene-home.mp3",
    durationInFrames: 240,
    startOffset: 4,
    endOffset: 0,
    chromeDismissAt: 18,
    chromeDismissDurationFrames: 42,
  } satisfies DemoScene,
];

export const LEGACY_LANDING_SCENES: SelectableScene[] = [
  ...INTRO_SLIDES,
  ...INTRO_DEMO_BEATS,
];

/**
 * Preserve the existing landing/signup/google-verification onboarding flow,
 * then continue directly into the inside-app workflow demo.
 */
export const DEFAULT_SCENES: SelectableScene[] = [
  ...LEGACY_LANDING_SCENES,
  ...APP_DEMO_SCENES,
];

/**
 * Standalone back-to-back playback of the full desktop walkthrough, post-cut
 * (error panels, white flashes, and stale idle UI removed via ffmpeg concat).
 * Rendered as its own `<Composition>` in `Root.tsx` so the main composition
 * is untouched.
 *
 * Phase order mirrors the product's phase bar: create → upload+plan →
 * explore → feature engineering → training + experiments. Files live in
 * `public/main/` and are prefixed with play order. `durationInFrames` is
 * `ceil(clip_seconds * 60)` since the composition runs at 60 fps and
 * `<OffthreadVideo>` plays at native wall-clock speed regardless of
 * source fps. Values below are placeholders filled in by the final
 * cutting pass.
 */
export const DESKTOP_DEMO_SCENES: SelectableScene[] = [
  {
    type: "demo",
    videoFile: "01-create-project.mp4",
    videoRoot: "main",
    chrome: "none",
    durationInFrames: 1090,
    startOffset: 0,
    endOffset: 0,
  } satisfies DemoScene,
  {
    type: "demo",
    videoFile: "02-upload-and-plan.mp4",
    videoRoot: "main",
    chrome: "none",
    durationInFrames: 2397,
    startOffset: 0,
    endOffset: 0,
  } satisfies DemoScene,
  {
    type: "demo",
    videoFile: "03-explorer-nl-sql.mp4",
    videoRoot: "main",
    chrome: "none",
    durationInFrames: 3304,
    startOffset: 0,
    endOffset: 0,
  } satisfies DemoScene,
  {
    type: "demo",
    videoFile: "04-preprocessing.mp4",
    videoRoot: "main",
    chrome: "none",
    durationInFrames: 3727,
    startOffset: 0,
    endOffset: 0,
  } satisfies DemoScene,
  {
    type: "demo",
    videoFile: "05-feature-engineering.mp4",
    videoRoot: "main",
    chrome: "none",
    durationInFrames: 7635,
    startOffset: 0,
    endOffset: 0,
  } satisfies DemoScene,
  {
    type: "demo",
    videoFile: "06-training-experiments.mp4",
    videoRoot: "main",
    chrome: "none",
    durationInFrames: 7315,
    startOffset: 0,
    endOffset: 0,
  } satisfies DemoScene,
  // Scene 07 opens with a 0.8s crossfade baked in at its head — dissolves
  // from clip 06's final Experiments frame (1 model on leaderboard) into
  // the updated leaderboard with a second model. Represents the off-screen
  // "train another model and return to Experiments" beat.
  {
    type: "demo",
    videoFile: "07-retrain-experiment.mp4",
    videoRoot: "main",
    chrome: "none",
    durationInFrames: 2491,
    startOffset: 0,
    endOffset: 0,
  } satisfies DemoScene,
];

export const DESKTOP_DEMO_TOTAL_FRAMES = DESKTOP_DEMO_SCENES.reduce(
  (sum, scene) => sum + (scene.durationInFrames ?? 0),
  0,
);
