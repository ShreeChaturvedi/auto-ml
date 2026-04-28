/**
 * export-presenter-pdf.mts — Snapshot every presenter slide to a printable PDF.
 *
 * Pipeline:
 *   1. Serve `out/present/` over a tiny static HTTP server on an ephemeral port.
 *   2. Launch headless Chromium via Playwright at 1920x1080 DPR=1.
 *   3. Toggle the HUD off with `H` so the chrome doesn't pollute the capture.
 *   4. For each of N slides, wait for paint, screenshot the full viewport, and
 *      advance with ArrowRight.
 *   5. Assemble the PNGs into a single-page-per-slide PDF via pdf-lib at
 *      1920x1080 pts (screen-viewing friendly — no letter/A4 scaling).
 *
 * Output: `video/out/presenter.pdf`.
 *
 * Usage: `npm run present:export-pdf`  (requires `npm run present:build` first).
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extname } from "node:path";
import { AddressInfo } from "node:net";

import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";

import { PRESENTATION_SCENES, settleFrameFor } from "../presentation/slides";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_ROOT = path.resolve(__dirname, "..");
const PRESENT_DIR = path.join(VIDEO_ROOT, "out", "present");
const OUT_PDF = path.join(VIDEO_ROOT, "out", "presenter.pdf");

/** Composition is 1920x1080; PDF page uses same pts for screen viewing. */
const VIEWPORT = { width: 1920, height: 1080 } as const;

/** ms to wait after navigating to a slide before screenshotting — allows the
 *  Player remount + settle-frame seek to paint. Tuned empirically. */
const SETTLE_MS = 900;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/** Minimal static server rooted at `root`. SPA fallback to index.html. */
function startStaticServer(root: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end();
        return;
      }
      const urlPath = decodeURIComponent(req.url.split("?")[0] ?? "/");
      let filePath = path.join(root, urlPath === "/" ? "/index.html" : urlPath);
      // Prevent path traversal.
      if (!filePath.startsWith(root)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        // SPA fallback — the presenter app is a single-route SPA.
        filePath = path.join(root, "index.html");
      }
      const ext = extname(filePath).toLowerCase();
      res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
      res.setHeader("cache-control", "no-store");
      createReadStream(filePath)
        .on("error", () => {
          res.statusCode = 500;
          res.end();
        })
        .pipe(res);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr) {
        reject(new Error("failed to acquire port"));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function main(): Promise<void> {
  if (!existsSync(path.join(PRESENT_DIR, "index.html"))) {
    throw new Error(
      `Missing ${PRESENT_DIR}/index.html. Run \`npm run present:build\` first.`,
    );
  }

  const total = PRESENTATION_SCENES.length;
  console.log(`Exporting ${total} slides → ${OUT_PDF}`);

  const { server, url } = await startStaticServer(PRESENT_DIR);
  console.log(`Static server listening at ${url}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { ...VIEWPORT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const shots: Buffer[] = [];
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    // Wait for Remotion Player mount + first paint.
    await page.waitForSelector(".__remotion-player", { timeout: 15_000 }).catch(
      () => {
        // Selector name may change; tolerate by just using time-based wait below.
      },
    );
    // Give fonts/player an extra grace period on first render.
    await page.waitForTimeout(1500);

    // Hide HUD overlay.
    await page.keyboard.press("h");
    await page.waitForTimeout(200);

    for (let i = 0; i < total; i += 1) {
      const scene = PRESENTATION_SCENES[i]!;
      const settle = settleFrameFor(scene);
      // The Player remount + seek effect runs on mount. Give it time to paint.
      await page.waitForTimeout(SETTLE_MS);
      const shot = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, ...VIEWPORT },
        omitBackground: false,
      });
      shots.push(shot);
      console.log(
        `  [${String(i + 1).padStart(2, "0")}/${total}] ${scene.id} @ f${settle} (${shot.byteLength} B)`,
      );
      if (i < total - 1) {
        await page.keyboard.press("ArrowRight");
      }
    }
  } finally {
    await context.close();
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // Assemble PDF.
  const pdf = await PDFDocument.create();
  for (const png of shots) {
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([VIEWPORT.width, VIEWPORT.height]);
    page.drawImage(img, {
      x: 0,
      y: 0,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
    });
  }
  const bytes = await pdf.save();
  await mkdir(path.dirname(OUT_PDF), { recursive: true });
  await writeFile(OUT_PDF, bytes);
  console.log(`Wrote ${OUT_PDF} (${bytes.byteLength} B, ${shots.length} pages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
