/**
 * Frame-grabs one PNG per phase from the landing-preview MP4 masters at
 * `video/public/captures/landing-previews/raw/`. Output goes to
 * `poster/public/phases/<key>.png`. Each PNG is taken from the 1.5-second
 * mark — long enough that the page-load animations have settled, short
 * enough to avoid mid-interaction blur.
 *
 * Requires `ffmpeg` on PATH. If it isn't installed, the script logs a
 * helpful error rather than failing silently.
 */

import { spawnSync, execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const VIDEO_RAW = resolve(REPO_ROOT, "video/public/captures/landing-previews/raw");
const OUT_DIR = resolve(__dirname, "../public/phases");

// Map poster phase key → preferred source MP4.
// `hero-*.mp4` are the marketing hero loops; the bare `<phase>.mp4` files are
// the fuller scene captures. We prefer hero-* where available and fall back
// to the bare capture otherwise.
const PHASES = [
  { key: "ingest", source: "hero-upload.mp4", fallback: "ingest.mp4" },
  { key: "explore", source: "hero-explore.mp4", fallback: "explore.mp4" },
  { key: "preprocess", source: "hero-preprocess.mp4", fallback: "preprocess.mp4" },
  { key: "engineer", source: null, fallback: "engineer.mp4" },
  { key: "train", source: "hero-train.mp4", fallback: "train.mp4" },
  { key: "experiments", source: null, fallback: "experiments.mp4" },
  { key: "deploy", source: "hero-deploy.mp4", fallback: "deploy.mp4" },
];

function ensureFfmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch {
    console.error(
      "[grab-phase-frames] ffmpeg not found on PATH. Install via:\n" +
        "  apt:  sudo apt install ffmpeg\n" +
        "  brew: brew install ffmpeg",
    );
    process.exit(1);
  }
}

function grab(srcMp4, outPng) {
  // Take a frame at t=1.5s. -frames:v 1 limits to a single frame; -y overwrites.
  const args = [
    "-y",
    "-ss",
    "1.5",
    "-i",
    srcMp4,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outPng,
  ];
  const res = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`ffmpeg exited ${res.status} on ${srcMp4}`);
  }
}

function main() {
  ensureFfmpeg();
  mkdirSync(OUT_DIR, { recursive: true });
  for (const phase of PHASES) {
    const candidates = [phase.source, phase.fallback].filter(Boolean);
    const found = candidates.find((c) => existsSync(resolve(VIDEO_RAW, c)));
    if (!found) {
      console.warn(
        `[grab-phase-frames] skipping ${phase.key}: no source MP4 found`,
      );
      continue;
    }
    const srcMp4 = resolve(VIDEO_RAW, found);
    const outPng = resolve(OUT_DIR, `${phase.key}.png`);
    console.log(`[grab-phase-frames] ${phase.key} ← ${found}`);
    grab(srcMp4, outPng);
  }
  console.log("[grab-phase-frames] done. Stills written to public/phases/.");
  console.log(
    "[grab-phase-frames] Reminder: flip `hasStill: false` → `true` in src/content.ts for each grabbed phase.",
  );
}

main();
