/**
 * Exports the running poster (http://localhost:5180) to a 48 × 36 inch PDF
 * via puppeteer. The script:
 *
 *   1. Waits for the dev server (or the production preview) to respond.
 *   2. Opens a Chromium tab at the poster URL.
 *   3. Awaits `document.fonts.ready` so no glyph regression makes it to print.
 *   4. Calls `page.pdf({ width: '48in', height: '36in', printBackground: true })`.
 *
 * The dev server must already be running. `npm run pdf` from this folder
 * assumes you've started it with `npm run dev` in another terminal.
 */

import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const URL = process.env.POSTER_URL ?? "http://localhost:5180";
const OUT_DIR = resolve("dist");
const OUT_PATH = process.env.POSTER_OUT
  ? resolve(process.env.POSTER_OUT)
  : resolve(OUT_DIR, "poster.pdf");

async function waitForServer(url, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server at ${url} did not respond after ${attempts}s`);
}

async function main() {
  console.log(`[export-pdf] waiting for ${URL}…`);
  await waitForServer(URL);

  console.log("[export-pdf] launching headless Chromium…");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    // Render at the full poster size so text and vectors are 1:1 in print.
    await page.setViewport({ width: 4608, height: 3456, deviceScaleFactor: 1 });
    await page.goto(URL, { waitUntil: "networkidle0", timeout: 60_000 });

    console.log("[export-pdf] waiting for document.fonts.ready…");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    // Settle one frame so any post-mount layout shifts land before print.
    await new Promise((r) => setTimeout(r, 500));

    mkdirSync(OUT_DIR, { recursive: true });
    console.log(`[export-pdf] rendering ${OUT_PATH}…`);
    await page.pdf({
      path: OUT_PATH,
      width: "48in",
      height: "36in",
      printBackground: true,
      preferCSSPageSize: true,
    });
    console.log(`[export-pdf] wrote ${OUT_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[export-pdf] failed:", err);
  process.exitCode = 1;
});
