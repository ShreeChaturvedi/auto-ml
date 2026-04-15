/**
 * capture-demo.ts — Playwright orchestrator that records each "beat" of the
 * product demo into `public/captures/<beat>.{webm,cursor.json,meta.json}`.
 *
 * The `scenes/Demo` component consumes these sidecars. See
 * `remotion/scenes/Demo/cursorJson.ts` for the exact cursor-entry shape.
 *
 * Usage:
 *   npm run capture:demo -- --beat=landing
 *   npm run capture:demo -- --beat=signup
 *   npm run capture:demo -- --beat=home
 *   npm run capture:demo -- --beat=all
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
import { drive as driveSignup } from "./capture/signupDriver";
import { drive as driveHome } from "./capture/homeDriver";
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
// Signal cleanup — Node's default SIGINT/SIGTERM exits skip `finally` blocks,
// which orphans any dev server we spawned + leaves Chromium's child processes
// hanging. Acquire sites push idempotent cleanup fns here; the handler below
// drains the list once on first signal, awaits everything, then `exit(130)`.
//
// A safety timer caps total cleanup at 5s so a hung child can't pin the
// process forever — if that fires we force-exit and accept the orphan risk.
// ---------------------------------------------------------------------------

const cleanupFns: Array<() => void | Promise<void>> = [];
let signalHandled = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    if (signalHandled) return;
    signalHandled = true;
    // Safety net: if cleanup stalls (e.g. Chromium IPC deadlock), exit anyway.
    const forceExit = setTimeout(() => process.exit(130), 5000);
    forceExit.unref();
    void (async () => {
      for (const fn of cleanupFns) {
        try {
          await fn();
        } catch {
          /* best-effort cleanup; swallow */
        }
      }
      process.exit(130);
    })();
  });
}

// ---------------------------------------------------------------------------
// Beat config
// ---------------------------------------------------------------------------

type BeatName = "landing" | "signup" | "home";

type BeatConfig = {
  name: BeatName;
  url: string;
  port: number;
  serverCwd: string;
  /**
   * npm script to run when we need to spawn the dev server. Defaults to `dev`.
   * signup/home override this to `dev:ui` so Vite starts without also
   * launching the backend via concurrently (the mock intercepts `/api/**`
   * before it hits a real backend, so the backend is dead weight here).
   */
  serverScript: string;
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
    serverScript: "dev",
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
    serverScript: "dev:ui",
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
    serverScript: "dev:ui",
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
  console.log(`[capture] starting dev server (npm run ${cfg.serverScript}) in ${cfg.serverCwd}...`);
  const logPath = `/tmp/capture-${cfg.name}-server.log`;
  const logStream = createWriteStream(logPath, { flags: "a" });
  const proc = spawn("npm", ["run", cfg.serverScript], {
    cwd: cfg.serverCwd,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.pipe(logStream);
  proc.stderr?.pipe(logStream);
  // Register signal cleanup for the spawned child BEFORE awaiting readiness —
  // if the user Ctrl+C's during `waitForHttp`, the child would otherwise orphan.
  cleanupFns.push(() => {
    if (!proc.killed) proc.kill("SIGTERM");
  });
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

  // __captureStart is pinned by a subsequent init script anchored to the
  // context-creation wall moment -- not set here to avoid a redundant write
  // that would mask the intended offset.
})();
`;

// ---------------------------------------------------------------------------
// Mock API — fakes every backend call the signup + home beats issue
// ---------------------------------------------------------------------------

// All mock state is derived from the frozen wall clock + a fixed user. The
// ISO timestamp matches `FROZEN_EPOCH_MS` (2026-04-15T15:30-04:00 =
// 2026-04-15T19:30Z) so server-issued `created_at`/`updated_at` fields line
// up with the page's `Date.now()`.
const FROZEN_ISO = "2026-04-15T19:30:00.000Z";
const MOCK_USER = {
  user_id: "ayush-yadav-001",
  email: "yadava5@miamioh.edu",
  name: "Ayush Yadav",
  role: "user" as const,
  email_verified: true,
  created_at: FROZEN_ISO,
  updated_at: FROZEN_ISO,
  last_login_at: FROZEN_ISO,
};

// "none"-alg JWT. `isJwtExpired` only inspects the payload (exp claim), so we
// can skip real signing. Using the page's frozen epoch (not Node's wall clock)
// keeps the token "fresh" from the app's point of view regardless of when the
// capture runs.
function fakeJwt(expEpochSeconds: number): string {
  const enc = (s: string) => Buffer.from(s).toString("base64url");
  return `${enc('{"alg":"none"}')}.${enc(
    JSON.stringify({ sub: MOCK_USER.user_id, exp: expEpochSeconds }),
  )}.sig`;
}

const FROZEN_NOW_S = Math.floor(FROZEN_EPOCH_MS / 1000);
const MOCK_ACCESS_TOKEN = fakeJwt(FROZEN_NOW_S + 7200); // 2h
const MOCK_REFRESH_TOKEN = fakeJwt(FROZEN_NOW_S + 86400); // 24h

const AUTH_ENVELOPE = {
  user: MOCK_USER,
  accessToken: MOCK_ACCESS_TOKEN,
  refreshToken: MOCK_REFRESH_TOKEN,
};

async function mockApi(route: Route): Promise<void> {
  const url = route.request().url();
  const pathname = new URL(url).pathname; // e.g. /api/auth/register
  const method = route.request().method();
  const key = `${method} ${pathname}`;

  const respond = (status: number, payload: unknown) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });

  switch (key) {
    case "POST /api/auth/register":
    case "POST /api/auth/login":
      return respond(200, AUTH_ENVELOPE);
    case "POST /api/auth/refresh":
      return respond(200, {
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
      });
    case "GET /api/auth/me":
      return respond(200, { user: MOCK_USER });
    case "GET /api/auth/google":
      // Empty authUrl → SignupForm won't redirect. Important: the form sets
      // `googleLoading=true` before awaiting this call. Return a resolved
      // empty authUrl so the button rearms cleanly.
      return respond(200, { authUrl: "" });
    case "GET /api/auth/verification-status":
      return respond(200, { emailVerified: true });
    case "GET /api/projects":
      // Empty list → HomePage falls into its "No Projects Yet" empty state.
      return respond(200, { projects: [] });
    case "POST /api/auth/logout":
      return respond(204, {});
    default:
      // Log unhandled calls loudly so we catch them before the final commit —
      // any missed route would show up as a network error in the UI. Fulfill
      // with 404 (not fallback) to keep the page off the real network.
      console.warn(`[capture] unmocked ${key} — returning 404`);
      return respond(404, { error: `No mock for ${key}` });
  }
}

// ---------------------------------------------------------------------------
// Auth seed — populates the Zustand persist envelope before any page JS runs
// ---------------------------------------------------------------------------

// Key is pinned via `fullName: 'auth-storage'` in `frontend/src/stores/authStore.ts`.
// Shape matches the `partialize` projection — `{ user, accessToken, refreshToken }`
// wrapped in `{ state, version }`. The `version` field must match the store's
// declared version (defaults to 1 in `createPersistedStore`).
const AUTH_SEED_SCRIPT = `
(() => {
  const envelope = ${JSON.stringify({
    state: {
      user: MOCK_USER,
      accessToken: MOCK_ACCESS_TOKEN,
      refreshToken: MOCK_REFRESH_TOKEN,
    },
    version: 1,
  })};
  try {
    localStorage.setItem("auth-storage", JSON.stringify(envelope));
  } catch (e) {
    console.error("[capture] failed to seed auth-storage", e);
  }
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

async function makeMarkPacer(cfg: BeatConfig, page: Page): Promise<MarkPacer> {
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
    // `characters` arrays. If the file's schema drifts, warn loudly — a
    // silent no-op lets drivers fall back to hardcoded timing with no signal
    // that VO sync is broken.
    const script = raw.rawScript;
    if (!script) {
      console.warn(
        `[capture] ${cfg.alignmentFile} is present but missing \`rawScript\` — mark pacing disabled, using hardcoded timing`,
      );
      return { hasAlignment: false, waitForMark: async () => {} };
    }
    const marks = resolveMarks(script, raw, FPS);
    return {
      hasAlignment: true,
      // Read elapsed from the *page* clock rather than the driver clock. The
      // cursor recorder also measures in page-clock space (`__captureStart`),
      // so both sides of the capture agree without Playwright cross-process
      // IPC drift polluting the timing.
      waitForMark: async (markName: string) => {
        const frame = marks[markName];
        if (frame === undefined) {
          console.warn(`[capture] unknown mark: ${markName}`);
          return;
        }
        const targetMs = (frame / FPS) * 1000;
        const elapsed = await page.evaluate(
          () =>
            performance.now() -
            (window as Window & { __captureStart?: number }).__captureStart!,
        );
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
  // Register browser cleanup so Ctrl+C doesn't leave a headless Chromium alive.
  // Returning the Promise lets the signal-handler loop await it; Playwright's
  // `browser.close()` is idempotent, so the normal-path `finally` below also
  // calls it and both no-op on an already-closed instance.
  cleanupFns.push(() => browser.close().catch(() => {}));
  let context: BrowserContext | null = null;
  try {
    // Anchor `__captureStart` to *context-creation* wall time rather than
    // document-init time. The webm recording begins at `newContext`; pinning
    // the page's capture origin there keeps cursor `t_ms` values and the
    // video's t=0 in lockstep, instead of drifting by the ~1-2s pre-nav gap.
    const contextStartWall = performance.now();
    context = await browser.newContext({
      viewport: cfg.viewport,
      recordVideo: { dir: videoTmpDir, size: cfg.viewport },
      deviceScaleFactor: 1,
    });
    await context.addInitScript({ content: DETERMINISM_SCRIPT });
    // Second init script re-pins `__captureStart` using the elapsed driver
    // time since context creation. When this runs in the page, the driver's
    // wall clock has advanced by `offsetMs`; telling the page to subtract
    // that much from its own `performance.now()` yields the context-creation
    // moment in page-clock space. IPC latency is single-digit ms — negligible
    // versus the 1-2s pre-nav gap this removes.
    await context.addInitScript((offsetMs: number) => {
      (window as Window & { __captureStart?: number }).__captureStart =
        performance.now() - offsetMs;
    }, performance.now() - contextStartWall);
    if (cfg.seedAuth) {
      await context.addInitScript({ content: AUTH_SEED_SCRIPT });
    }

    const page = await context.newPage();
    if (cfg.mockApi) {
      // Must be installed BEFORE `goto` so first-mount fetches get routed.
      await page.route("http://localhost:4000/api/**", mockApi);
    }

    const pacer = await makeMarkPacer(cfg, page);
    const cursor = makeCursorRecorder();

    console.log(`[capture] navigating to ${cfg.url}`);
    await page.goto(cfg.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // `document.fonts.ready` resolves even on font failure; pad with a buffer.
    await page.evaluate(() => document.fonts.ready);
    // Mocked beats resolve every `/api/**` call in-process, so `networkidle`
    // fires almost instantly and the 500 ms cushion is pure dead air we can't
    // afford on the short (15 s / 4 s) scenes. Landing still needs both.
    if (cfg.mockApi) {
      await page
        .waitForLoadState("networkidle", { timeout: 2000 })
        .catch(() => {
          /* short SPAs may never fully quiesce — tolerate. */
        });
    } else {
      await page.waitForLoadState("networkidle").catch(() => {
        /* networkidle may not quiesce on heavy SPAs — tolerate. */
      });
      await sleep(500);
    }

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
    } else if (cfg.name === "signup") {
      await driveSignup(driverArgs);
    } else if (cfg.name === "home") {
      await driveHome(driverArgs);
    } else {
      // Exhaustiveness guard — `cfg.name` is a BeatName union, so reaching
      // the default here means a new beat was added without a driver.
      const _unreachable: never = cfg.name;
      throw new Error(`[capture] no driver for beat: ${_unreachable}`);
    }

    // Persist cursor + derive wall-clock duration; context.close flushes webm.
    const cursorEntries = cursor.entries();
    await page.waitForTimeout(250); // small post-drive tail so last frame is clean
    const videoWallMs = performance.now() - contextStartWall;
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

    // Verify file size. Floor is intentionally loose (300 KB): VP8 compresses
    // static dark forms (signup) aggressively — a 12 s capture of a mostly
    // still page lands ~500 KB. The check's real job is catching zero-byte
    // webms / pure-black frames from a failed recording, not enforcing a
    // minimum bitrate.
    const st = await stat(finalWebm);
    if (st.size < 300_000) {
      throw new Error(
        `[capture] ${finalWebm} is only ${st.size} bytes — expected >300 KB. Capture failed.`,
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
      // If the user just Ctrl+C'd, the in-flight Playwright call throws as
      // soon as the signal-handler closes the browser. Don't log those errors
      // — the handler owns the exit (code 130) and they're just noise.
      if (signalHandled) return;
      failed += 1;
      console.error(`[capture] ${cfg.name} failed:`, err);
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  if (signalHandled) return;
  console.error(err);
  process.exit(1);
});
