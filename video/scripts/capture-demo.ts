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

import {
  APP_DEMO_PHASES,
  type AppDemoPreset,
} from "../config/appDemo";
import { FPS } from "../config/fps";
import {
  expandBeatSelection,
  formatBeatSelectionUsage,
  isBeatSelection,
  type BeatName,
  type BeatSelection,
} from "./capture/beatCatalog";
import { drive as driveAppDemo } from "./capture/appDemoDriver";
import { startAppDemoMockServer } from "./capture/appDemoMockServer";
import { drive as driveHome } from "./capture/homeDriver";
import { resolveMarks, type AlignmentBlock } from "./resolveMarks";
import { ScreencastRecorder } from "./capture/screencastRecorder";
import { drive as driveLanding } from "./capture/landingDriver";
import { drive as driveSignup } from "./capture/signupDriver";
import type {
  CaptureMeta,
  CursorEntry,
  CursorRecorder,
  DriverResult,
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

type BeatDriver = "landing" | "signup" | "home" | "appDemo";

type ResolvedServerEndpoint = {
  baseUrl: string;
  port: number;
};

type ServerConfig = {
  url: string;
  port: number;
  cwd: string;
  /** npm script name (defaults to `dev`). */
  script: string;
  /** Label used in log output — e.g. "frontend" / "landing". */
  label: string;
  /** Extra env vars required by the spawned server. */
  env?: Record<string, string>;
  /** Launch strategy override when npm scripts pin their own port. */
  launcher?: "npm" | "astro";
};

type BeatConfig = {
  name: BeatName;
  driver: BeatDriver;
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
  launcher?: "npm" | "astro";
  viewport: { width: number; height: number };
  /** When true, mocks `/api/**` calls; enable for signup/home, off for landing. */
  mockApi: boolean;
  /** When true, seeds auth tokens into localStorage before goto. */
  seedAuth: boolean;
  /** Extra env vars for the primary frontend server. */
  serverEnv?: Record<string, string>;
  /** App-demo beat metadata used to boot the dedicated mock server. */
  appDemoPreset?: AppDemoPreset;
  alignmentFile?: string;
  /**
   * Additional dev servers the beat needs running. signup needs both the
   * frontend (primary) AND the landing server so the multi-tab verification
   * flow can open the painterly new-tab + Gmail-lookalike pages.
   */
  companionServers?: ReadonlyArray<ServerConfig>;
};

function resolveServerEndpoint({
  label,
  fallbackUrl,
  fallbackPort,
  urlEnvName,
  portEnvName,
}: {
  label: string;
  fallbackUrl: string;
  fallbackPort: number;
  urlEnvName: string;
  portEnvName: string;
}): ResolvedServerEndpoint {
  const envUrl = process.env[urlEnvName]?.trim();
  const envPort = process.env[portEnvName]?.trim();
  const url = new URL(envUrl || fallbackUrl);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`[capture] ${urlEnvName} must use http:// or https:// for ${label}.`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`[capture] ${urlEnvName} must be an origin-only URL for ${label}.`);
  }

  let port = url.port ? Number.parseInt(url.port, 10) : fallbackPort;
  if (envPort) {
    port = Number.parseInt(envPort, 10);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`[capture] ${portEnvName} must be a valid TCP port for ${label}.`);
  }

  url.port = String(port);
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    port,
  };
}

function withPath(baseUrl: string, pathname: string): string {
  return new URL(pathname, `${baseUrl}/`).toString();
}

function serverSpawnArgs(script: string, port: number): string[] {
  return ["run", script, "--", "--host", "0.0.0.0", "--port", String(port)];
}

function resolveServerSpawn(spec: ServerConfig): {
  command: string;
  args: string[];
} {
  if (spec.launcher === "astro") {
    return {
      command: "npx",
      args: ["astro", "dev", "--host", "0.0.0.0", "--port", String(spec.port)],
    };
  }
  return {
    command: "npm",
    args: serverSpawnArgs(spec.script, spec.port),
  };
}

const FRONTEND_SERVER = resolveServerEndpoint({
  label: "frontend",
  fallbackUrl: "http://localhost:5173",
  fallbackPort: 5173,
  urlEnvName: "CAPTURE_FRONTEND_URL",
  portEnvName: "CAPTURE_FRONTEND_PORT",
});

const APP_DEMO_FRONTEND_SERVER = resolveServerEndpoint({
  label: "app-demo-frontend",
  fallbackUrl: "http://localhost:4173",
  fallbackPort: 4173,
  urlEnvName: "CAPTURE_APP_DEMO_FRONTEND_URL",
  portEnvName: "CAPTURE_APP_DEMO_FRONTEND_PORT",
});

const LANDING_SERVER = resolveServerEndpoint({
  label: "landing",
  fallbackUrl: "http://localhost:4321",
  fallbackPort: 4321,
  urlEnvName: "CAPTURE_LANDING_URL",
  portEnvName: "CAPTURE_LANDING_PORT",
});

const LEGACY_BEATS = {
  landing: {
    name: "landing",
    driver: "landing",
    url: withPath(LANDING_SERVER.baseUrl, "/"),
    port: LANDING_SERVER.port,
    serverCwd: path.join(REPO_ROOT, "landing"),
    serverScript: "dev",
    launcher: "astro",
    viewport: { width: 1920, height: 1080 },
    mockApi: false,
    seedAuth: false,
    alignmentFile: "scene-landing.alignment.json",
  },
  signup: {
    name: "signup",
    driver: "signup",
    url: withPath(FRONTEND_SERVER.baseUrl, "/signup"),
    port: FRONTEND_SERVER.port,
    serverCwd: path.join(REPO_ROOT, "frontend"),
    serverScript: "dev:ui",
    viewport: { width: 1728, height: 848 },
    mockApi: true,
    seedAuth: false,
    alignmentFile: "scene-signup.alignment.json",
    companionServers: [
      {
        // Landing serves `/newtab` + `/mock-gmail*` — the second Playwright
        // tab navigates there for the Gmail-lookalike verification flow.
        label: "landing",
        url: withPath(LANDING_SERVER.baseUrl, "/"),
        port: LANDING_SERVER.port,
        cwd: path.join(REPO_ROOT, "landing"),
        script: "dev",
        launcher: "astro",
        env: {
          PUBLIC_FRONTEND_ORIGIN: FRONTEND_SERVER.baseUrl,
        },
      },
    ],
  },
  home: {
    name: "home",
    driver: "home",
    url: withPath(FRONTEND_SERVER.baseUrl, "/"),
    port: FRONTEND_SERVER.port,
    serverCwd: path.join(REPO_ROOT, "frontend"),
    serverScript: "dev:ui",
    viewport: { width: 1728, height: 848 },
    mockApi: true,
    seedAuth: true,
    alignmentFile: "scene-home.alignment.json",
  },
} as const satisfies Record<"landing" | "signup" | "home", BeatConfig>;

const PHASE_BEAT_CONFIGS = Object.fromEntries(
  APP_DEMO_PHASES.map((phase) => [
    phase.preset,
    {
      name: phase.preset,
      driver: "appDemo",
      url: withPath(
        APP_DEMO_FRONTEND_SERVER.baseUrl,
        `/project/novacraft-growth/${phase.phaseSlug}`,
      ),
      port: APP_DEMO_FRONTEND_SERVER.port,
      serverCwd: path.join(REPO_ROOT, "frontend"),
      serverScript: "dev:ui",
      viewport: { width: 1600, height: 1000 },
      mockApi: false,
      seedAuth: true,
      appDemoPreset: phase.preset,
    } satisfies BeatConfig,
  ]),
) as Record<Exclude<BeatName, "landing" | "signup" | "home">, BeatConfig>;

const BEATS: Record<BeatName, BeatConfig> = {
  ...LEGACY_BEATS,
  ...PHASE_BEAT_CONFIGS,
};

// ---------------------------------------------------------------------------
// CLI parsing — tiny, no extra dep
// ---------------------------------------------------------------------------

function parseArgs(argv: readonly string[]): { beat: BeatSelection } {
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
    console.error(`Usage: capture-demo --beat=<${formatBeatSelectionUsage()}>`);
    process.exit(2);
  }
  if (!isBeatSelection(beat)) {
    console.error(`Unknown beat: ${beat}`);
    process.exit(2);
  }
  return { beat };
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

/**
 * Boot (or reuse) a single dev server. Kept as a standalone helper so the
 * primary beat server and any companion servers share the same probe →
 * spawn → readiness flow.
 */
async function ensureOneServer(
  spec: ServerConfig,
  beatName: string,
): Promise<ServerHandle> {
  // Try the URL directly — a reachable server is a reachable server regardless
  // of which interface it bound to. `net.createServer().listen(port, "127.0.0.1")`
  // doesn't always collide with IPv6-bound processes, so HTTP probing is more
  // reliable than socket-bind testing.
  const already = await waitForHttp(spec.url, 1000);
  if (already) {
    console.log(`[capture] reusing ${spec.label} at ${spec.url}`);
    return { proc: null, startedByUs: false };
  }
  if (!existsSync(path.join(spec.cwd, "node_modules"))) {
    console.error(
      `[capture] ${spec.cwd}/node_modules missing. Run: npm --prefix ${path.relative(REPO_ROOT, spec.cwd)} install`,
    );
    process.exit(1);
  }
  console.log(`[capture] starting ${spec.label} (npm run ${spec.script}) in ${spec.cwd}...`);
  const logPath = `/tmp/capture-${beatName}-${spec.label}-server.log`;
  const logStream = createWriteStream(logPath, { flags: "a" });
  const spawnSpec = resolveServerSpawn(spec);
  const proc = spawn(spawnSpec.command, spawnSpec.args, {
    cwd: spec.cwd,
    env: { ...process.env, FORCE_COLOR: "0", ...(spec.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.pipe(logStream);
  proc.stderr?.pipe(logStream);
  // Register signal cleanup for the spawned child BEFORE awaiting readiness —
  // if the user Ctrl+C's during `waitForHttp`, the child would otherwise orphan.
  cleanupFns.push(() => {
    if (!proc.killed) proc.kill("SIGTERM");
  });
  const up = await waitForHttp(spec.url, 60_000);
  if (!up) {
    proc.kill();
    console.error(`[capture] ${spec.label} didn't respond within 60s. See ${logPath}.`);
    process.exit(1);
  }
  console.log(`[capture] ${spec.label} up at ${spec.url}`);
  return { proc, startedByUs: true };
}

async function ensureServer(
  cfg: BeatConfig,
  primaryEnv?: Record<string, string>,
): Promise<ServerHandle[]> {
  const primary: ServerConfig = {
    label: cfg.name,
    url: cfg.url,
    port: cfg.port,
    cwd: cfg.serverCwd,
    script: cfg.serverScript,
    launcher: cfg.launcher,
    env: { ...(cfg.serverEnv ?? {}), ...(primaryEnv ?? {}) },
  };
  const specs: ReadonlyArray<ServerConfig> = [
    primary,
    ...(cfg.companionServers ?? []),
  ];
  const handles: ServerHandle[] = [];
  // Boot sequentially — companion servers tend to share `npm install` caches
  // and hit the same file descriptors; parallel spawns occasionally race on
  // Vite's dep-cache rebuilds. The 5-10 s overhead is negligible vs capture
  // lengths (~1 minute).
  for (const spec of specs) {
    handles.push(await ensureOneServer(spec, cfg.name));
  }
  return handles;
}

// ---------------------------------------------------------------------------
// Determinism init script — runs BEFORE any page script
// ---------------------------------------------------------------------------

// 2026-04-15T15:30:00-04:00 → getHours() = 15 → "Good afternoon".
const FROZEN_EPOCH_MS = 1776670200000;
// Seed = sum of char codes for "Ayush".
const RANDOM_SEED = 546;

/**
 * Per-beat mutable state — tracks whether the verification email has been
 * "clicked" yet so `GET /auth/verification-status` returns the right value
 * as the flow progresses. Reset at the top of every `captureBeat()`.
 *
 * The mock verification token (`mock-verify-token-abc123`) is hardcoded in
 * `landing/src/pages/mock-gmail/email.astro` — the mock accepts any value,
 * but the Astro page embeds the known string so the link text reads real.
 */
let emailVerified = false;

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
const MOCK_USER_BASE = {
  user_id: "ayush-yadav-001",
  email: "yadava5@miamioh.edu",
  name: "Ayush",
  role: "user" as const,
  created_at: FROZEN_ISO,
  updated_at: FROZEN_ISO,
  last_login_at: FROZEN_ISO,
};

/**
 * Current mock user, reflecting the live `emailVerified` flag. Tabs in the
 * same context see consistent state because every response is built from
 * this getter — not a closed-over snapshot.
 */
const getMockUser = () => ({ ...MOCK_USER_BASE, email_verified: emailVerified });

// "none"-alg JWT. `isJwtExpired` only inspects the payload (exp claim), so we
// can skip real signing. Using the page's frozen epoch (not Node's wall clock)
// keeps the token "fresh" from the app's point of view regardless of when the
// capture runs.
function fakeJwt(expEpochSeconds: number): string {
  const enc = (s: string) => Buffer.from(s).toString("base64url");
  return `${enc('{"alg":"none"}')}.${enc(
    JSON.stringify({ sub: MOCK_USER_BASE.user_id, exp: expEpochSeconds }),
  )}.sig`;
}

const FROZEN_NOW_S = Math.floor(FROZEN_EPOCH_MS / 1000);
const MOCK_ACCESS_TOKEN = fakeJwt(FROZEN_NOW_S + 7200); // 2h
const MOCK_REFRESH_TOKEN = fakeJwt(FROZEN_NOW_S + 86400); // 24h

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
      return respond(200, {
        user: getMockUser(),
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
      });
    case "POST /api/auth/refresh":
      return respond(200, {
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
      });
    case "GET /api/auth/me":
      return respond(200, { user: getMockUser() });
    case "GET /api/auth/google":
      // Empty authUrl → SignupForm won't redirect. Important: the form sets
      // `googleLoading=true` before awaiting this call. Return a resolved
      // empty authUrl so the button rearms cleanly.
      return respond(200, { authUrl: "" });
    case "POST /api/auth/verify-email":
      // Flip the shared flag so later verification-status polls + /auth/me
      // reads see the user as verified. Token value is not checked — we own
      // both sides of the mock and know the link embeds MOCK_VERIFY_TOKEN.
      emailVerified = true;
      return respond(200, { message: "Email verified." });
    case "POST /api/auth/resend-verification":
      return respond(200, { message: "Verification email sent." });
    case "GET /api/auth/verification-status":
      return respond(200, { emailVerified });
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
//
// The seeded user is always verified — `seedAuth` beats skip the signup +
// verification flow entirely and expect a logged-in, fully-verified session.
const AUTH_SEED_SCRIPT = `
(() => {
  const envelope = ${JSON.stringify({
    state: {
      user: { ...MOCK_USER_BASE, email_verified: true },
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
      try {
        await mark(page, x, y, true);
      } catch {
        // Navigation may destroy the execution context before the post-click
        // mark can evaluate. Synthesize a click entry from the pre-click
        // timestamp so cursor JSON always records the click event.
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          entries.push({
            t_ms: lastEntry.t_ms + 50,
            x: Math.round(x),
            y: Math.round(y),
            click: true,
          });
        }
      }
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
//
// Snap-at-threshold (CRITICAL for video capture): when the easing approaches
// `raw=1`, each rAF tick lands a handful of pixels short of `target`
// (e.g. at `raw=0.97`, ease-in-out quad yields `t≈0.9989`, leaving the
// compositor ~4 px short of target for one animation frame). At a 25 fps
// webm sampling rate those last 1-3 frames of "almost settled" scroll
// snapshot into the recording as a visible 3-6 px jitter that cuts the
// footer wordmark's letter ascenders. The snap-threshold short-circuits
// once the eased position is within 0.5 px of target: we jump to the exact
// target, resolve the promise, and queue a double-rAF so the compositor
// commits the settled paint before the next driver action unblocks. This
// guarantees the webm never captures a "near-target" scroll frame.
const RAF_SCROLL_FN = `
async (target, dur) => {
  await new Promise((resolve) => {
    const start = performance.now();
    const startY = window.scrollY;
    const delta = target - startY;
    function frame(now) {
      const raw = Math.min(1, (now - start) / dur);
      const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      const y = startY + delta * t;
      if (raw >= 1 || Math.abs(target - y) < 0.5) {
        window.scrollTo({ top: target, behavior: "instant" });
        resolve();
      } else {
        window.scrollTo({ top: y, behavior: "instant" });
        requestAnimationFrame(frame);
      }
    }
    requestAnimationFrame(frame);
  });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
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
  if (!cfg.alignmentFile) {
    return {
      hasAlignment: false,
      waitForMark: async () => {
        /* no-op: driver should rely on its hardcoded waits */
      },
    };
  }
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

type WebmPolishProfile = "vp8-source" | "clean-ui-source";

const shouldUseCustomRecorder = (cfg: BeatConfig): boolean =>
  cfg.driver === "landing" || cfg.driver === "appDemo";

const getCaptureDeviceScaleFactor = (cfg: BeatConfig): number =>
  cfg.driver === "appDemo" ? 2 : 1;

const getCustomRecorderOptions = (cfg: BeatConfig) => {
  if (cfg.driver === "appDemo") {
    return {
      // App-demo clips are dense UI captures with thin strokes and small copy,
      // so we bypass JPEG artifacts and downsample a 2x DPR render back into
      // the authored 1600x1000 frame size.
      format: "png" as const,
      x264Preset: "slow" as const,
      x264Crf: 8,
      pixelFormat: "yuv444p" as const,
      x264Tune: "animation" as const,
    };
  }

  return {};
};

const getWebmPolishProfile = (cfg: BeatConfig): WebmPolishProfile =>
  cfg.driver === "appDemo" ? "clean-ui-source" : "vp8-source";

// ---------------------------------------------------------------------------
// Capture one beat
// ---------------------------------------------------------------------------

async function captureBeat(cfg: BeatConfig): Promise<void> {
  await mkdir(CAPTURES_DIR, { recursive: true });
  const videoTmpDir = path.join(CAPTURES_DIR, `.${cfg.name}-tmp`);
  await mkdir(videoTmpDir, { recursive: true });
  const useCustomRecorder = shouldUseCustomRecorder(cfg);
  const customRawCapturePath = path.join(videoTmpDir, `${cfg.name}.raw.mkv`);
  const appDemoMockServer =
    cfg.driver === "appDemo" && cfg.appDemoPreset
      ? await startAppDemoMockServer({
          beat: cfg.appDemoPreset,
          port: 0,
          frontendOrigin: APP_DEMO_FRONTEND_SERVER.baseUrl,
        })
      : null;

  // Reset per-beat mock state so reruns start from a known baseline. Beats
  // with `seedAuth` short-circuit the verification flow by pretending the
  // user has already verified — everything else starts unverified.
  emailVerified = cfg.seedAuth;
  if (appDemoMockServer) {
    cleanupFns.push(() => appDemoMockServer.close().catch(() => {}));
  }

  const server = await ensureServer(
    cfg,
    appDemoMockServer
      ? {
          VITE_API_BASE: appDemoMockServer.apiBaseUrl,
          VITE_API_BASE_URL: appDemoMockServer.apiBaseUrl,
        }
      : undefined,
  );
  const browser = await chromium.launch({ headless: true });
  // Register browser cleanup so Ctrl+C doesn't leave a headless Chromium alive.
  // Returning the Promise lets the signal-handler loop await it; Playwright's
  // `browser.close()` is idempotent, so the normal-path `finally` below also
  // calls it and both no-op on an already-closed instance.
  cleanupFns.push(() => browser.close().catch(() => {}));
  let context: BrowserContext | null = null;
  let screencastRecorder: ScreencastRecorder | null = null;
  try {
    // Anchor `__captureStart` to the moment the active recorder starts, not to
    // document init. The built-in Playwright recorder starts at `newContext`;
    // the custom screencast path starts immediately after `newPage()` and
    // before the first navigation. In both cases this keeps cursor `t_ms`
    // values and video t=0 in lockstep across the pre-nav gap.
    const contextCreatedWall = performance.now();
    let captureStartWall = contextCreatedWall;
    context = await browser.newContext({
      viewport: cfg.viewport,
      ...(useCustomRecorder ? {} : { recordVideo: { dir: videoTmpDir, size: cfg.viewport } }),
      deviceScaleFactor: getCaptureDeviceScaleFactor(cfg),
    });
    let page!: Page;
    if (useCustomRecorder) {
      page = await context.newPage();
      screencastRecorder = await ScreencastRecorder.start({
        page,
        outputPath: customRawCapturePath,
        size: cfg.viewport,
        ...getCustomRecorderOptions(cfg),
      });
      captureStartWall = screencastRecorder.startedAtWallMs;
      cleanupFns.push(() =>
        screencastRecorder
          ? screencastRecorder.stop().then(() => {}).catch(() => {})
          : undefined,
      );
    }

    await context.addInitScript({ content: DETERMINISM_SCRIPT });

    // Pre-navigate: disable Hero's 3.2 s auto-scroll BEFORE the page loads.
    // Driver also sets this post-load for belt-and-suspenders, but doing it
    // pre-navigate guarantees the flag exists when Hero's useEffect runs.
    if (cfg.driver === "landing") {
      await context.addInitScript(() => {
        (
          window as Window & { __heroAutoScrollDisabled?: boolean }
        ).__heroAutoScrollDisabled = true;
      });
    }
    // Re-pin `__captureStart` using the elapsed driver time since the active
    // recorder started so page-clock measurements line up with video t=0.
    await context.addInitScript((offsetMs: number) => {
      (window as Window & { __captureStart?: number }).__captureStart =
        performance.now() - offsetMs;
    }, performance.now() - captureStartWall);
    if (cfg.seedAuth) {
      await context.addInitScript({ content: AUTH_SEED_SCRIPT });
    }
    if (cfg.mockApi) {
      // Context-scoped route so any additional pages a driver opens (e.g. the
      // second tab that drives the Gmail-lookalike verification flow) also
      // route `/api/**` through the mock. Must be installed BEFORE the first
      // `goto` so first-mount fetches get routed.
      await context.route("http://localhost:4000/api/**", mockApi);
    }

    if (!useCustomRecorder) {
      page = await context.newPage();
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
      frontendOrigin: FRONTEND_SERVER.baseUrl,
      landingOrigin: LANDING_SERVER.baseUrl,
      // Multi-tab driver support. Lightweight enough to pass unconditionally
      // — single-tab drivers just ignore these fields.
      makeCursor: makeCursorRecorder,
      contextMs: () => performance.now() - captureStartWall,
    };
    let driverResult: DriverResult | void;
    if (cfg.driver === "landing") {
      driverResult = await driveLanding(driverArgs);
    } else if (cfg.driver === "signup") {
      driverResult = await driveSignup(driverArgs);
    } else if (cfg.driver === "home") {
      driverResult = await driveHome(driverArgs);
    } else if (cfg.driver === "appDemo") {
      if (!cfg.appDemoPreset || !appDemoMockServer) {
        throw new Error(`[capture] missing app-demo runtime for beat ${cfg.name}`);
      }
      driverResult = await driveAppDemo({
        page,
        cursor,
        rafScroll,
        waitForMark: pacer.waitForMark,
        hasAlignment: pacer.hasAlignment,
        beat: cfg.appDemoPreset,
        fixturePaths: appDemoMockServer.fixturePaths,
      });
    } else {
      // Exhaustiveness guard — `cfg.driver` is a BeatDriver union, so reaching
      // the default here means a new beat was added without a driver.
      const _unreachable: never = cfg.driver;
      throw new Error(`[capture] no driver for beat: ${_unreachable}`);
    }

    // Persist cursor + derive wall-clock duration; context.close flushes webm.
    const cursorEntries = cursor.entries();
    const extraPages = driverResult?.extraPages ?? [];
    await page.waitForTimeout(250); // small post-drive tail so last frame is clean
    const finalWebm = path.join(CAPTURES_DIR, `${cfg.name}.webm`);
    const videoWallMs = performance.now() - captureStartWall;
    const extraFiles: Array<{ file: string; openedAtMs: number; url?: string }> = [];

    if (screencastRecorder) {
      if (extraPages.length > 0) {
        throw new Error("[capture] custom recorder does not support extra pages");
      }
      const rawCapturePath = await screencastRecorder.stop();
      screencastRecorder = null;
      await context.close();
      context = null;
      await polishWebm(rawCapturePath, finalWebm, {
        profile: getWebmPolishProfile(cfg),
      });
      await writePreviewMp4(finalWebm);
      await rm(rawCapturePath, { force: true }).catch(() => {});
    } else {
      // Capture video handles BEFORE context.close() — the Video object is
      // stable (`.path()` resolves post-close), but calling `.video()` on a
      // closed page throws.
      const videoHandle = page.video();
      const extraVideos = extraPages.map((extra) => ({
        handle: extra.page.video(),
        entries: extra.entries,
        openedAtMs: extra.openedAtMs,
        labelSuffix: extra.labelSuffix,
        url: extra.url,
      }));
      await context.close();
      context = null;

      // Claim each webm from the tmp dir. Playwright writes randomly-named
      // files; we match each page to its own file via `video().path()`.
      await claimWebm(videoHandle, videoTmpDir, finalWebm);
      await polishWebm(finalWebm, finalWebm, {
        profile: getWebmPolishProfile(cfg),
      });
      await writePreviewMp4(finalWebm);

      for (const extra of extraVideos) {
        const suffixed = path.join(
          CAPTURES_DIR,
          `${cfg.name}-${extra.labelSuffix}.webm`,
        );
        await claimWebm(extra.handle, videoTmpDir, suffixed);
        await polishWebm(suffixed, suffixed, {
          profile: getWebmPolishProfile(cfg),
        });
        await writePreviewMp4(suffixed);
        const cursorName = `${cfg.name}-${extra.labelSuffix}.cursor.json`;
        await writeFile(
          path.join(CAPTURES_DIR, cursorName),
          JSON.stringify(extra.entries, null, 2) + "\n",
        );
        const extraDurationMs = await probeDurationMs(
          suffixed,
          Math.max(1, videoWallMs - extra.openedAtMs),
        );
        const extraMeta: CaptureMeta = {
          fps: FPS,
          width: cfg.viewport.width,
          height: cfg.viewport.height,
          durationMs: Math.round(extraDurationMs),
        };
        await writeFile(
          path.join(
            CAPTURES_DIR,
            `${cfg.name}-${extra.labelSuffix}.meta.json`,
          ),
          JSON.stringify(extraMeta, null, 2) + "\n",
        );
        extraFiles.push({
          file: `${cfg.name}-${extra.labelSuffix}.webm`,
          openedAtMs: Math.round(extra.openedAtMs),
          ...(extra.url ? { url: extra.url } : {}),
        });
        console.log(
          `[capture] ${cfg.name}-${extra.labelSuffix}: ${extra.entries.length} cursor waypoints`,
        );
      }
    }

    // Remove tmp dir + any remaining orphan files.
    await rm(videoTmpDir, { recursive: true, force: true }).catch(() => {});

    // Write primary cursor JSON.
    const cursorPath = path.join(CAPTURES_DIR, `${cfg.name}.cursor.json`);
    await writeFile(cursorPath, JSON.stringify(cursorEntries, null, 2) + "\n");

    // Write meta JSON — prefer ffprobe duration, fall back to wall clock.
    const durationMs = await probeDurationMs(finalWebm, videoWallMs);
    const meta: CaptureMeta = {
      fps: FPS,
      width: cfg.viewport.width,
      height: cfg.viewport.height,
      durationMs: Math.round(durationMs),
      ...(extraFiles.length > 0 ? { tabs: extraFiles } : {}),
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
    if (screencastRecorder) await screencastRecorder.stop().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (appDemoMockServer) await appDemoMockServer.close().catch(() => {});
    await browser.close().catch(() => {});
    // Ensure the tmp dir is gone even if we errored before cleanup above.
    await rm(videoTmpDir, { recursive: true, force: true }).catch(() => {});
    for (const handle of server) {
      if (handle.startedByUs && handle.proc && !handle.proc.killed) {
        handle.proc.kill("SIGTERM");
      }
    }
  }
}

/**
 * Move the webm produced by `videoHandle` (or any orphan .webm in
 * `tmpDir` if the handle is missing) to `dest`. Used for both the primary
 * page's video and any secondary-tab videos so each lands at a stable
 * `<beat>[-<suffix>].webm` path inside `public/captures/`.
 */
async function claimWebm(
  videoHandle: ReturnType<Page["video"]>,
  tmpDir: string,
  dest: string,
): Promise<void> {
  const producedPath = videoHandle ? await videoHandle.path() : null;
  if (producedPath && existsSync(producedPath)) {
    await rename(producedPath, dest);
    return;
  }
  const files = await readdir(tmpDir);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error(`[capture] no .webm for ${dest} in ${tmpDir}`);
  await rename(path.join(tmpDir, webm), dest);
}

const getPolishEncodeArgs = (profile: WebmPolishProfile): string[] => {
  if (profile === "clean-ui-source") {
    return [
      "-c:v", "libvpx-vp9",
      "-pix_fmt", "yuv420p",
      "-crf", "16",
      "-b:v", "0",
      "-deadline", "good",
      "-cpu-used", "0",
      "-row-mt", "1",
      "-tile-columns", "1",
      "-auto-alt-ref", "1",
      "-lag-in-frames", "25",
    ];
  }

  return [
    "-vf", "hqdn3d=1.5:1:2:1.5,unsharp=5:5:0.5:5:5:0.0",
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuv420p",
    "-crf", "22",
    "-b:v", "0",
    "-deadline", "good",
    "-cpu-used", "2",
    "-row-mt", "1",
  ];
};

/**
 * Re-encode capture sources into the canonical VP9 `.webm` assets consumed by
 * Remotion. Low-bitrate Playwright VP8 recordings still need a light cleanup
 * pass, while the app-demo's high-fidelity screencasts should preserve crisp
 * UI edges and spend more bitrate on the final encode instead of denoising.
 *
 * Falls back silently to the input asset if ffmpeg isn't available.
 */
async function polishWebm(
  inputPath: string,
  outputPath = inputPath,
  options?: { profile?: WebmPolishProfile },
): Promise<void> {
  const profile = options?.profile ?? "vp8-source";
  const tmpOut = outputPath + ".tmp.webm";
  try {
    execFileSync("ffmpeg", [
      "-y",
      "-i", inputPath,
      ...getPolishEncodeArgs(profile),
      tmpOut,
    ], { timeout: 180_000, stdio: "pipe" });
    await rename(tmpOut, outputPath);
    console.log(`[capture] polished ${path.basename(outputPath)} → VP9 (${profile})`);
  } catch {
    console.warn(`[capture] ffmpeg polish skipped for ${path.basename(outputPath)} (ffmpeg unavailable or failed)`);
    await rm(tmpOut, { force: true }).catch(() => {});
    if (inputPath !== outputPath) {
      const inputExt = path.extname(inputPath).toLowerCase();
      const outputExt = path.extname(outputPath).toLowerCase();
      if (inputExt !== outputExt) {
        await rm(outputPath, { force: true }).catch(() => {});
        throw new Error(
          `[capture] ffmpeg polish failed for ${path.basename(outputPath)} — refusing to relabel ${path.basename(inputPath)} as ${outputExt || "the requested output format"}`,
        );
      }
      await rename(inputPath, outputPath).catch(async () => {
        // If a stale output exists or the rename races, best-effort replace it.
        await rm(outputPath, { force: true }).catch(() => {});
        await rename(inputPath, outputPath);
      });
    }
  }
}

/**
 * Emit an H.264 MP4 mirror beside the authoritative webm for browser-preview
 * compatibility. Studio preview prefers the `.mp4`; if this step fails we
 * delete any stale mirror so preview cleanly falls back to the fresh webm.
 */
async function writePreviewMp4(webmPath: string): Promise<void> {
  const mp4Path = webmPath.replace(/\.webm$/i, ".mp4");
  if (mp4Path === webmPath) return;

  const tmpOut = mp4Path + ".tmp.mp4";
  try {
    execFileSync("ffmpeg", [
      "-y",
      "-i", webmPath,
      "-an",
      "-c:v", "libx264",
      "-preset", "slow",
      "-tune", "animation",
      "-crf", "16",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      tmpOut,
    ], { timeout: 180_000, stdio: "pipe" });
    await rename(tmpOut, mp4Path);
    console.log(`[capture] wrote ${path.basename(mp4Path)} preview mirror`);
  } catch {
    console.warn(`[capture] mp4 preview mirror skipped for ${path.basename(webmPath)} (ffmpeg unavailable or failed)`);
    await rm(tmpOut, { force: true }).catch(() => {});
    await rm(mp4Path, { force: true }).catch(() => {});
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
  const beats = expandBeatSelection(beat).map((name) => BEATS[name]);

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
