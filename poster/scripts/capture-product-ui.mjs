/**
 * Captures the real product UI from the frontend dev server using Puppeteer.
 *
 * Loads `/dev/landing-preview?preset=preprocess`, forces light mode, waits for
 * the capture-scenario "ready" state, optionally advances the animation to a
 * visually-rich frame, and saves a high-DPI PNG to `poster/public/captures/`.
 *
 * Usage: `npm run capture` from the poster workspace (starts frontend if
 * needed).
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTER_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(POSTER_ROOT, "..");
const FRONTEND_ROOT = path.join(REPO_ROOT, "frontend");
const OUTPUT_DIR = path.join(POSTER_ROOT, "public", "captures");

const FRONTEND_URL = "http://127.0.0.1:5173";

// Poster-grade capture: 2× the on-poster render size so we stay sharp even
// printed at 200+ dpi. The Preprocess UI fills 1600×1000 comfortably; we
// capture 2400×1500 to give the card plenty of print headroom.
const VIEWPORT = { width: 2400, height: 1500 };

const PRESETS = [
  {
    preset: "preprocess",
    output: "preprocess.png",
    // Fire start() and wait a beat so the second assistant bubble + the
    // edit_cell tool-call highlight are fully on-screen when we snap.
    runForMs: 4600,
  },
];

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok || res.status === 404) return true;
    } catch {
      // keep polling
    }
    await sleep(250);
  }
  return false;
}

async function ensureFrontendServer() {
  if (await waitForHttp(FRONTEND_URL, 1000)) {
    console.log(`[capture] reusing frontend at ${FRONTEND_URL}`);
    return null;
  }
  console.log("[capture] starting frontend dev server...");
  const proc = spawn(
    "npm",
    ["run", "dev:ui", "--", "--host", "0.0.0.0", "--port", "5173"],
    {
      cwd: FRONTEND_ROOT,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: "inherit",
    },
  );
  const up = await waitForHttp(FRONTEND_URL, 120_000);
  if (!up) {
    proc.kill("SIGTERM");
    throw new Error("Frontend dev server did not become ready in 120s.");
  }
  return proc;
}

async function capture({ preset, output, runForMs }) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
    });

    // Pin light mode BEFORE the app boots. We override both getItem and
    // setItem for the theme key, and actively patch the DOM class after the
    // theme provider's useLayoutEffect has run.
    await page.evaluateOnNewDocument(() => {
      const THEME_KEY = "automl-ui-theme";
      try {
        const proto = Storage.prototype;
        const origGet = proto.getItem;
        const origSet = proto.setItem;
        proto.getItem = function patched(key) {
          if (key === THEME_KEY) return "light";
          return origGet.call(this, key);
        };
        proto.setItem = function patched(key, val) {
          if (key === THEME_KEY) return origSet.call(this, key, "light");
          return origSet.call(this, key, val);
        };
        window.localStorage.setItem(THEME_KEY, "light");
      } catch (e) {
        console.warn("[capture] could not pin theme", e);
      }
    });

    const url = `${FRONTEND_URL}/dev/landing-preview?preset=${preset}`;
    console.log(`[capture] loading ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await page.waitForFunction(
      () => window.__landingPreviewCapture?.status === "ready",
      { timeout: 30_000 },
    );

    // Force-flip to light mode immediately after mount. The theme provider
    // reads localStorage on init, but as a belt-and-suspenders we also flip
    // the class on <html> and the attribute on <body> in case any color-
    // mode side-channel was set before we intercepted localStorage.
    await page.evaluate(() => {
      const root = document.documentElement;
      root.classList.remove("dark");
      if (!root.classList.contains("light")) root.classList.add("light");
      root.style.colorScheme = "light";
    });

    console.log(`[capture] ${preset}: ready, running animation...`);

    await page.evaluate(() => {
      window.__landingPreviewCapture?.start?.();
    });

    await sleep(runForMs);

    // Belt-and-suspenders again after animation: ensure no dark class crept back.
    await page.evaluate(() => {
      const root = document.documentElement;
      root.classList.remove("dark");
      if (!root.classList.contains("light")) root.classList.add("light");
    });

    const outputPath = path.join(OUTPUT_DIR, output);
    await page.screenshot({
      path: outputPath,
      type: "png",
      omitBackground: false,
    });
    console.log(`[capture] wrote ${outputPath}`);

    // Write a tiny metadata file so callers know the capture geometry.
    await writeFile(
      outputPath.replace(/\.png$/, ".meta.json"),
      JSON.stringify(
        { preset, viewport: VIEWPORT, runForMs, capturedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const frontendProc = await ensureFrontendServer();
  try {
    for (const p of PRESETS) {
      await capture(p);
    }
  } finally {
    if (frontendProc && !frontendProc.killed) {
      frontendProc.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error("[capture] failed:", err);
  process.exit(1);
});
