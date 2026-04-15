/**
 * capture-demo.ts — Playwright orchestrator that records each "beat" of the
 * product demo into `public/captures/<beat>.{webm,cursor.json,meta.json}`.
 *
 * The `scenes/Demo` component consumes these sidecars. See
 * `remotion/scenes/Demo/cursorJson.ts` for the exact cursor-entry shape.
 *
 * Usage:
 *   npm run capture:demo -- --beat=landing
 *   npm run capture:demo -- --beat=all
 *
 * For Task 2 only `landing` is wired; `signup`/`home` drivers are Task 3.
 *
 * Ordering contract (documented end-to-end in `AGENTS.md`):
 *   launch → newContext(recordVideo) → addInitScript(determinism) →
 *   [addInitScript(seedAuth)?] → newPage → [route(mock)?] → goto →
 *   document.fonts.ready → networkidle → drive → context.close (flushes)
 *   → rename .webm → write cursor + meta JSON.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type BrowserContext, type Page, type Route } from "playwright";

import { FPS } from "../config/fps";
import { resolveMarks, type AlignmentBlock } from "./resolveMarks";
import { drive as driveLanding } from "./capture/landingDriver";
import type {
  CaptureMeta,
  CursorEntry,
  CursorRecorder,
  MarkPacer,
  RafScroll,
} from "./capture/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(VIDEO_ROOT, "..");
const CAPTURES_DIR = path.join(VIDEO_ROOT, "public", "captures");
const VOICEOVER_DIR = path.join(VIDEO_ROOT, "public", "voiceover", "main");

// ---------------------------------------------------------------------------
// Beat config
// ---------------------------------------------------------------------------

type BeatName = "landing" | "signup" | "home";

type BeatConfig = {
  name: BeatName;
  url: string;
  port: number;
  serverCwd: string;
  viewport: { width: number; height: number };
  /** When true, mocks `/api/**` calls; enable for signup/home, off for landing. */
  mockApi: boolean;
  /** When true, seeds auth tokens into localStorage before goto. */
  seedAuth: boolean;
  alignmentFile: string;
};

const BEATS: Record<BeatName, BeatConfig> = {
  landing: {
    name: "landing",
    url: "http://localhost:4321/",
    port: 4321,
    serverCwd: path.join(REPO_ROOT, "landing"),
    viewport: { width: 1920, height: 1080 },
    mockApi: false,
    seedAuth: false,
    alignmentFile: "scene-landing.alignment.json",
  },
  signup: {
    name: "signup",
    url: "http://localhost:5173/signup",
    port: 5173,
    serverCwd: path.join(REPO_ROOT, "frontend"),
    viewport: { width: 1728, height: 848 },
    mockApi: true,
    seedAuth: false,
    alignmentFile: "scene-signup.alignment.json",
  },
  home: {
    name: "home",
    url: "http://localhost:5173/",
    port: 5173,
    serverCwd: path.join(REPO_ROOT, "frontend"),
    viewport: { width: 1728, height: 848 },
    mockApi: true,
    seedAuth: true,
    alignmentFile: "scene-home.alignment.json",
  },
};

// ---------------------------------------------------------------------------
// CLI parsing — tiny, no extra dep
// ---------------------------------------------------------------------------

function parseArgs(argv: readonly string[]): { beat: BeatName | "all" } {
  let beat: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--beat=")) beat = arg.slice("--beat=".length);
    else if (arg === "--beat") continue; // value follows; handled when prev seen
  }
  // Support `--beat landing` form too.
  for (let i = 0; i < argv.length - 1; i += 1) {
    if (argv[i] === "--beat" && !argv[i + 1]?.startsWith("--")) {
      beat = argv[i + 1];
    }
  }
  if (!beat) {
    console.error("Usage: capture-demo --beat=<landing|signup|home|all>");
    process.exit(2);
  }
  if (!["landing", "signup", "home", "all"].includes(beat)) {
    console.error(`Unknown beat: ${beat}`);
    process.exit(2);
  }
  return { beat: beat as BeatName | "all" };
}

// ---------------------------------------------------------------------------
// Port probe + dev server boot — generalized from `capture-landing.ts`
// ---------------------------------------------------------------------------

async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 404) return true;
    } catch {
      /* not yet */
    }
    await sleep(250);
  }
  return false;
}

type ServerHandle = { proc: ChildProcess | null; startedByUs: boolean };

async function ensureServer(cfg: BeatConfig): Promise<ServerHandle> {
  // Try the URL directly — a reachable server is a reachable server regardless
  // of which interface it bound to. `net.createServer().listen(port, "127.0.0.1")`
  // doesn't always collide with IPv6-bound processes, so HTTP probing is more
  // reliable than socket-bind testing.
  const already = await waitForHttp(cfg.url, 1000);
  if (already) {
    console.log(`[capture] reusing server at ${cfg.url}`);
    return { proc: null, startedByUs: false };
  }
  if (!existsSync(path.join(cfg.serverCwd, "node_modules"))) {
    console.error(
      `[capture] ${cfg.serverCwd}/node_modules missing. Run: npm --prefix ${path.relative(REPO_ROOT, cfg.serverCwd)} install`,
    );
    process.exit(1);
  }
  console.log(`[capture] starting dev server in ${cfg.serverCwd}...`);
  const logPath = `/tmp/capture-${cfg.name}-server.log`;
  const logStream = createWriteStream(logPath, { flags: "a" });
  const proc = spawn("npm", ["run", "dev"], {
    cwd: cfg.serverCwd,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.pipe(logStream);
  proc.stderr?.pipe(logStream);
  const up = await waitForHttp(cfg.url, 60_000);
  if (!up) {
    proc.kill();
    console.error(`[capture] dev server didn't respond within 60s. See ${logPath}.`);
    process.exit(1);
  }
  console.log(`[capture] server up at ${cfg.url}`);
  return { proc, startedByUs: true };
}

// ---------------------------------------------------------------------------
// Determinism init script — runs BEFORE any page script
// ---------------------------------------------------------------------------

// 2026-04-15T15:30:00-04:00 → getHours() = 15 → "Good afternoon".
const FROZEN_EPOCH_MS = 1776670200000;
// Seed = sum of char codes for "Ayush".
const RANDOM_SEED = 546;

const DETERMINISM_SCRIPT = `
(() => {
  const FROZEN_MS = ${FROZEN_EPOCH_MS};
  const OriginalDate = Date;
  class FrozenDate extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) super(FROZEN_MS);
      else super(...args);
    }
    static now() { return FROZEN_MS; }
  }
  Object.getOwnPropertyNames(OriginalDate).forEach((k) => {
    if (k in FrozenDate) return;
    const d = Object.getOwnPropertyDescriptor(OriginalDate, k);
    if (d) Object.defineProperty(FrozenDate, k, d);
  });
  // eslint-disable-next-line no-global-assign
  Date = FrozenDate;

  let s = ${RANDOM_SEED};
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };

  window.__captureStart = performance.now();
})();
`;

// ---------------------------------------------------------------------------
// Mock API + auth seed — stubs for Task 3
// ---------------------------------------------------------------------------

async function mockApi(route: Route): Promise<void> {
  // Task 3 will fill per-endpoint responses here. For now every call falls
  // through to the real network — which will 404 on signup/home but is fine
  // for landing (which doesn't hit the backend at all).
  await route.fallback();
}

const AUTH_SEED_SCRIPT = `
(() => {
  // Task 3: populate localStorage with a valid JWT + user object so the home
  // route mounts without hitting /api/auth/me. Placeholder for now.
})();
`;

// ---------------------------------------------------------------------------
// Cursor recorder — writes entries in the page's `__captureStart` timebase
// ---------------------------------------------------------------------------

function makeCursorRecorder(): CursorRecorder {
  const entries: CursorEntry[] = [];
  async function mark(page: Page, x: number, y: number, click: boolean) {
    const t_ms = await page.evaluate(
      () => performance.now() - (window as unknown as { __captureStart: number }).__captureStart,
    );
    const entry: CursorEntry = { t_ms: Math.max(0, Math.round(t_ms)), x: Math.round(x), y: Math.round(y) };
    if (click) entry.click = true;
    entries.push(entry);
  }
  return {
    async move(page, x, y, steps = 20) {
      await page.mouse.move(x, y, { steps });
      await mark(page, x, y, false);
    },
    async click(page, x, y) {
      await page.mouse.move(x, y, { steps: 20 });
      await mark(page, x, y, false);
      await page.mouse.click(x, y);
      await mark(page, x, y, true);
    },
    entries: () => entries,
  };
}

// ---------------------------------------------------------------------------
// rAF-eased scroll helper — native smooth-scroll finishes too quickly
// ---------------------------------------------------------------------------

// Passed as a raw string to bypass the tsx/SWC transform which injects
// `__name(...)` helper calls around named inner functions and arrow
// constants. Those helpers aren't defined inside the page context and crash
// the evaluate() invocation. A JS-literal body dodges the transform entirely.
const RAF_SCROLL_FN = `
async (target, dur) => {
  await new Promise((resolve) => {
    const start = performance.now();
    const startY = window.scrollY;
    const delta = target - startY;
    function frame(now) {
      const raw = Math.min(1, (now - start) / dur);
      const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      window.scrollTo({ top: startY + delta * t, behavior: "instant" });
      if (raw < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
`;

const rafScroll: RafScroll = async (page, targetY, durationMs) => {
  await page.evaluate(
    `(${RAF_SCROLL_FN})(${targetY}, ${durationMs})`,
  );
};

// ---------------------------------------------------------------------------
// Mark-to-ms pacer — reads `<beat>.alignment.json` if present
// ---------------------------------------------------------------------------

async function makeMarkPacer(cfg: BeatConfig, startMs: number): Promise<MarkPacer> {
  const alignmentPath = path.join(VOICEOVER_DIR, cfg.alignmentFile);
  if (!existsSync(alignmentPath)) {
    return {
      hasAlignment: false,
      waitForMark: async () => {
        /* no-op: driver should rely on its hardcoded waits */
      },
    };
  }
  try {
    const raw = JSON.parse(await readFile(alignmentPath, "utf-8")) as AlignmentBlock & {
      rawScript?: string;
    };
    // ElevenLabs alignment JSONs we ship bundle `rawScript` alongside the
    // `characters` arrays. If the file's schema drifts, fall back to a no-op.
    const script = raw.rawScript;
    if (!script) return { hasAlignment: false, waitForMark: async () => {} };
    const marks = resolveMarks(script, raw, FPS);
    return {
      hasAlignment: true,
      waitForMark: async (markName: string) => {
        const frame = marks[markName];
        if (frame === undefined) return;
        const targetMs = (frame / FPS) * 1000;
        const elapsed = performance.now() - startMs;
        const wait = targetMs - elapsed;
        if (wait > 0) await sleep(wait);
      },
    };
  } catch (err) {
    console.warn(`[capture] failed to parse ${alignmentPath}; proceeding without pacing`, err);
    return { hasAlignment: false, waitForMark: async () => {} };
  }
}

// ---------------------------------------------------------------------------
// Capture one beat
// ---------------------------------------------------------------------------

async function captureBeat(cfg: BeatConfig): Promise<void> {
  await mkdir(CAPTURES_DIR, { recursive: true });
  const videoTmpDir = path.join(CAPTURES_DIR, `.${cfg.name}-tmp`);
  await mkdir(videoTmpDir, { recursive: true });

  const server = await ensureServer(cfg);
  const browser = await chromium.launch({ headless: true });
  let context: BrowserContext | null = null;
  const captureStartWall = performance.now();
  try {
    context = await browser.newContext({
      viewport: cfg.viewport,
      recordVideo: { dir: videoTmpDir, size: cfg.viewport },
      deviceScaleFactor: 1,
    });
    await context.addInitScript({ content: DETERMINISM_SCRIPT });
    if (cfg.seedAuth) {
      await context.addInitScript({ content: AUTH_SEED_SCRIPT });
    }

    const page = await context.newPage();
    if (cfg.mockApi) {
      // Must be installed BEFORE `goto` so first-mount fetches get routed.
      await page.route("http://localhost:4000/api/**", mockApi);
    }

    const pacer = await makeMarkPacer(cfg, captureStartWall);
    const cursor = makeCursorRecorder();

    console.log(`[capture] navigating to ${cfg.url}`);
    await page.goto(cfg.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // `document.fonts.ready` resolves even on font failure; pad with a buffer.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle").catch(() => {
      /* networkidle may not quiesce on heavy SPAs — tolerate. */
    });
    await sleep(500);

    console.log(`[capture] driving ${cfg.name}...`);
    const driverArgs = {
      page,
      cursor,
      rafScroll,
      waitForMark: pacer.waitForMark,
      hasAlignment: pacer.hasAlignment,
    };
    if (cfg.name === "landing") {
      await driveLanding(driverArgs);
    } else {
      // Task 3 will wire signup + home drivers here.
      console.warn(`[capture] driver for '${cfg.name}' not yet implemented; recording static goto`);
      await page.waitForTimeout(8000);
    }

    // Persist cursor + derive wall-clock duration; context.close flushes webm.
    const cursorEntries = cursor.entries();
    await page.waitForTimeout(250); // small post-drive tail so last frame is clean
    const videoWallMs = performance.now() - captureStartWall;
    const videoHandle = page.video();
    await context.close();
    context = null;

    // Find the produced webm inside videoTmpDir and rename it.
    const producedPath = videoHandle ? await videoHandle.path() : null;
    const finalWebm = path.join(CAPTURES_DIR, `${cfg.name}.webm`);
    if (producedPath && existsSync(producedPath)) {
      await rename(producedPath, finalWebm);
    } else {
      const files = await readdir(videoTmpDir);
      const webm = files.find((f) => f.endsWith(".webm"));
      if (!webm) throw new Error(`[capture] no .webm produced in ${videoTmpDir}`);
      await rename(path.join(videoTmpDir, webm), finalWebm);
    }
    // Remove tmp dir + any remaining orphan files.
    await rm(videoTmpDir, { recursive: true, force: true }).catch(() => {});

    // Write cursor JSON.
    const cursorPath = path.join(CAPTURES_DIR, `${cfg.name}.cursor.json`);
    await writeFile(cursorPath, JSON.stringify(cursorEntries, null, 2) + "\n");

    // Write meta JSON — prefer ffprobe duration, fall back to wall clock.
    const durationMs = await probeDurationMs(finalWebm, videoWallMs);
    const meta: CaptureMeta = {
      fps: FPS,
      width: cfg.viewport.width,
      height: cfg.viewport.height,
      durationMs: Math.round(durationMs),
    };
    const metaPath = path.join(CAPTURES_DIR, `${cfg.name}.meta.json`);
    await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n");

    // Verify file size.
    const st = await stat(finalWebm);
    if (st.size < 1_000_000) {
      throw new Error(
        `[capture] ${finalWebm} is only ${st.size} bytes — expected >1 MB. Capture failed.`,
      );
    }
    console.log(
      `[capture] ${cfg.name}: ${(st.size / 1e6).toFixed(2)} MB, ${(meta.durationMs / 1000).toFixed(2)}s, ${cursorEntries.length} cursor waypoints`,
    );
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
    // Ensure the tmp dir is gone even if we errored before cleanup above.
    await rm(videoTmpDir, { recursive: true, force: true }).catch(() => {});
    if (server.startedByUs && server.proc && !server.proc.killed) {
      server.proc.kill("SIGTERM");
    }
  }
}

async function probeDurationMs(webmPath: string, fallbackMs: number): Promise<number> {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", webmPath],
      { encoding: "utf-8", timeout: 10_000 },
    );
    const secs = parseFloat(out.trim());
    if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  } catch {
    /* ffprobe missing or failed — use wall-clock fallback */
  }
  return fallbackMs;
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { beat } = parseArgs(process.argv.slice(2));
  const beats: BeatConfig[] =
    beat === "all" ? [BEATS.landing, BEATS.signup, BEATS.home] : [BEATS[beat]];

  let failed = 0;
  for (const cfg of beats) {
    try {
      await captureBeat(cfg);
    } catch (err) {
      failed += 1;
      console.error(`[capture] ${cfg.name} failed:`, err);
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
