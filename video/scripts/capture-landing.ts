/**
 * capture-landing.ts — Beat 1 landing-page capture.
 *
 * Boots the Astro landing dev server (port 4321) if it isn't already
 * running, drives Playwright (chromium) to render the full landing page,
 * pauses every CSS animation at its END state so the screenshot looks
 * "fully settled", then writes:
 *
 *   - video/public/landing/landing-full.png          (full-page PNG, 2x DPR)
 *   - video/public/landing/hotspots.json             (bbox index by name)
 *   - video/public/landing/sections/hero.png         (sharper zoom-target crop)
 *   - video/public/landing/sections/features.png
 *   - video/public/landing/sections/footer.png
 *
 * Coordinate system note for hotspots.json:
 *   bboxes are written in CSS px (the coordinate space the
 *   `document.documentElement` scrollbox reports). The LandingScreen
 *   scales from CSS-px → composition px using `COMP_WIDTH / 1440`.
 *   Because the captured PNG is at 2x DPR (2880 wide), bboxes in
 *   *PNG-space* are `{x,y,w,h} * 2`. The consumer always multiplies
 *   by the ratio `COMP_WIDTH / CSS_VIEWPORT_WIDTH` (= 1920 / 1440 ≈
 *   1.333) and the PNG's intrinsic display width matches via the
 *   <Img> scale — so CSS px is the single source of truth here.
 *
 * If the Astro dev server can't be started (missing landing/node_modules,
 * port in use with an unresponsive process, Astro build error) the script
 * exits with code 1 and leaves any previously-captured PNGs in place.
 * Callers (humans + CI) should run `npm --prefix landing install` first.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_ROOT = path.resolve(__dirname, "..");
const LANDING_ROOT = path.resolve(VIDEO_ROOT, "..", "landing");
const OUT_DIR = path.join(VIDEO_ROOT, "public", "landing");
const SECTIONS_DIR = path.join(OUT_DIR, "sections");

const ASTRO_PORT = 4321;
const ASTRO_URL = `http://localhost:${ASTRO_PORT}/`;
const BOOT_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Port probe — avoids starting a second Astro if one is already up
// ---------------------------------------------------------------------------

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer()
      .once("error", (err: NodeJS.ErrnoException) => {
        resolve(err.code === "EADDRINUSE");
      })
      .once("listening", () => {
        tester.close(() => resolve(false));
      })
      .listen(port, "127.0.0.1");
  });
}

async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok || res.status === 404) return true;
    } catch {
      /* server not up yet */
    }
    await sleep(500);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Astro boot
// ---------------------------------------------------------------------------

type AstroHandle = { proc: ChildProcess | null; startedByUs: boolean };

async function ensureAstroRunning(): Promise<AstroHandle> {
  const portInUse = await isPortInUse(ASTRO_PORT);
  if (portInUse) {
    const up = await waitForHttp(ASTRO_URL, 2_000);
    if (up) {
      console.log(`[capture] Astro already running on ${ASTRO_URL}`);
      return { proc: null, startedByUs: false };
    }
    console.error(
      `[capture] Port ${ASTRO_PORT} is in use but not responding to HTTP. ` +
        `Kill the stuck process and retry.`,
    );
    process.exit(1);
  }

  if (!existsSync(path.join(LANDING_ROOT, "node_modules"))) {
    console.error(
      `[capture] landing/node_modules missing. Run: npm --prefix landing install`,
    );
    process.exit(1);
  }

  console.log(`[capture] Starting astro dev at ${ASTRO_URL}…`);
  const logFile = "/tmp/capture-landing-astro.log";
  const logStream = createWriteStream(logFile, { flags: "a" });
  const proc = spawn("npm", ["run", "dev"], {
    cwd: LANDING_ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.pipe(logStream);
  proc.stderr?.pipe(logStream);

  const up = await waitForHttp(ASTRO_URL, BOOT_TIMEOUT_MS);
  if (!up) {
    proc.kill();
    console.error(
      `[capture] Astro did not come up within ${BOOT_TIMEOUT_MS}ms. ` +
        `See ${logFile} for details.`,
    );
    process.exit(1);
  }
  console.log(`[capture] Astro up.`);
  return { proc, startedByUs: true };
}

// ---------------------------------------------------------------------------
// Hotspot extraction spec
// ---------------------------------------------------------------------------

type Hotspot = { x: number; y: number; w: number; h: number };

/** Duck-typed subset of Playwright's Page API we touch. */
type CapturePage = {
  goto: (url: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  evaluate: <T, A = void>(
    fn: A extends void ? () => T | Promise<T> : (arg: A) => T | Promise<T>,
    arg?: A,
  ) => Promise<T>;
  addStyleTag: (opts: { content: string }) => Promise<unknown>;
  waitForLoadState: (state: string) => Promise<void>;
  screenshot: (opts: {
    path?: string;
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
  }) => Promise<Buffer>;
};

/** Primary + fallback selectors per hotspot name. First match wins. */
const HOTSPOT_SELECTORS: Record<string, string[]> = {
  agentically: [".hero-agentically"],
  "chat-card": ['.features-card[data-index="01"]', ".features-card", "#feature-chat"],
  "agent-wordmark": [".footer-agent-mark", ".footer-giant-wordmark", "footer"],
  "nav-cta": [".nav-cta"],
  "hero-cta": [".hero-cta"],
  "hero-title": [".hero-title"],
};

// ---------------------------------------------------------------------------
// Main capture routine
// ---------------------------------------------------------------------------

async function runCapture(): Promise<void> {
  // Lazy-load playwright so the script can exit with a clean error if the
  // package isn't installed (without crashing at module-import time).
  // We duck-type the subset of the chromium API we actually use, so this
  // file typechecks even before `npm install` brings playwright on-disk.
  type ChromiumLike = {
    launch: (opts: { headless: boolean }) => Promise<{
      newContext: (opts: {
        viewport: { width: number; height: number };
        deviceScaleFactor: number;
      }) => Promise<{
        newPage: () => Promise<CapturePage>;
      }>;
      close: () => Promise<void>;
    }>;
  };
  let chromium: ChromiumLike;
  try {
    const pw = (await import(
      /* @vite-ignore */
      "playwright" as string
    )) as { chromium: ChromiumLike };
    chromium = pw.chromium;
  } catch {
    console.error(
      `[capture] playwright not installed. Run: ` +
        `npm --prefix video install --save-dev @playwright/test playwright` +
        ` && npx --prefix video playwright install chromium`,
    );
    process.exit(1);
  }

  await mkdir(SECTIONS_DIR, { recursive: true });

  const astro = await ensureAstroRunning();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    console.log(`[capture] Navigating to ${ASTRO_URL}`);
    await page.goto(ASTRO_URL, { waitUntil: "networkidle", timeout: 30_000 });

    // Pause every CSS animation at its END state so the capture looks settled.
    await page.evaluate(() => {
      document.querySelectorAll("*").forEach((el) => {
        (el as HTMLElement & {
          getAnimations?: () => Array<{
            pause: () => void;
            currentTime: number | null;
            effect?: { getTiming: () => { duration?: number | string } } | null;
          }>;
        })
          .getAnimations?.()
          .forEach((a) => {
            try {
              const dur = a.effect?.getTiming?.().duration;
              a.currentTime = typeof dur === "number" ? dur : 0;
              a.pause();
            } catch {
              /* ignore */
            }
          });
      });
    });

    // @property custom properties don't enumerate via getAnimations, so set
    // the conic pill trace's final state explicitly on the root.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--pill-sweep", "360deg");
      document.documentElement.style.setProperty("--pill-trail", "hsl(0 0% 38%)");
    });

    // Hide scrollbars in the captured image.
    await page.addStyleTag({
      content: `
        html::-webkit-scrollbar { display: none; }
        html { -ms-overflow-style: none; scrollbar-width: none; }
      `,
    });

    // Give animations + late fonts a beat to settle after pauses apply.
    await page.waitForLoadState("networkidle");
    await sleep(500);

    const fullPath = path.join(OUT_DIR, "landing-full.png");
    console.log(`[capture] Writing full-page PNG → ${fullPath}`);
    await page.screenshot({ path: fullPath, fullPage: true });

    // Extract hotspot bboxes (CSS-px in the scrolling document coord space).
    const hotspots = await page.evaluate((spec: Record<string, string[]>) => {
      const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const [name, selectors] of Object.entries(spec)) {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const rect = (el as HTMLElement).getBoundingClientRect();
          out[name] = {
            x: Math.round(rect.left + window.scrollX),
            y: Math.round(rect.top + window.scrollY),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
          break;
        }
      }
      return out;
    }, HOTSPOT_SELECTORS);

    const hotspotsPath = path.join(OUT_DIR, "hotspots.json");
    await writeFile(hotspotsPath, JSON.stringify(hotspots, null, 2) + "\n");
    console.log(
      `[capture] Wrote hotspots.json with ${Object.keys(hotspots).length} bbox(es)`,
    );

    // Per-section sharper crops (clip coords are CSS px at 2x DPR).
    const sectionMap: Array<[string, Hotspot | undefined]> = [
      ["hero", hotspots["hero-title"] ?? hotspots.agentically],
      ["features", hotspots["chat-card"]],
      ["footer", hotspots["agent-wordmark"]],
    ];

    for (const [name, bbox] of sectionMap) {
      if (!bbox) {
        console.log(`[capture] Skipping sections/${name}.png — no bbox`);
        continue;
      }
      const clip = {
        x: Math.max(0, bbox.x - 16),
        y: Math.max(0, bbox.y - 16),
        width: bbox.w + 32,
        height: bbox.h + 32,
      };
      const secPath = path.join(SECTIONS_DIR, `${name}.png`);
      await page.screenshot({ path: secPath, clip });
      console.log(`[capture] Wrote sections/${name}.png`);
    }
  } finally {
    await browser.close();
    if (astro.startedByUs && astro.proc) {
      astro.proc.kill();
      console.log(`[capture] Stopped astro dev (PID ${astro.proc.pid}).`);
    }
  }
}

runCapture()
  .then(() => {
    console.log(`[capture] Done.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[capture] Failed:`, err);
    process.exit(1);
  });
