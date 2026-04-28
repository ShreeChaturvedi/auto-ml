/**
 * Exports the running booklet (http://localhost:5181) to a 28-page PDF via
 * puppeteer. Near-verbatim clone of /poster/scripts/export-pdf.mjs with
 * viewport/page dimensions switched to booklet scale.
 *
 * BLEED: Every sheet in the output is rendered at the **full bleed-box**
 * dimension of 8.75×11.25in (= 630×810pt). This lets Puppeteer use a single
 * page size for all 28 pages while still honoring bleed on the 7 full-bleed
 * pages (covers + 5 dividers). Non-bleed pages carry an internal 0.125in
 * white frame (see print.css `.page`); bleed pages use `data-bleed="true"`
 * to grow to the full sheet. The press shop trims back to 8.5×11in.
 *
 * FONT EMBEDDING / PDF/X PREFLIGHT: All fonts in this PDF are currently
 * emitted as Type 3 — Puppeteer/Skia encodes variable-axis fonts (Plus
 * Jakarta, Instrument Serif, Monaspace) as Type 3 glyph procedures rather
 * than subsetting to Type 1 or TrueType. PDF/X-1a and PDF/X-4 preflight
 * will REJECT Type 3 fonts for commercial press submission. For the expo
 * print run, post-process the PDF with Ghostscript to re-embed as Type 1:
 *   gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress \
 *      -dEmbedAllFonts=true -dSubsetFonts=true -sOutputFile=out.pdf in.pdf
 * Out of scope for this pass — the review-stage PDF is fine as Type 3.
 *
 * The dev server must be running — `npm run dev` in another terminal, or
 * CI starts one up before invoking this script.
 */

import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const URL = process.env.BOOKLET_URL ?? "http://localhost:5181";
const OUT_DIR = resolve("dist");
const OUT_PATH = process.env.BOOKLET_OUT
  ? resolve(process.env.BOOKLET_OUT)
  : resolve(OUT_DIR, "booklet.pdf");

async function waitForServer(url, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not yet — loop
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
    // 8.75"×11.25" bleed box at 96dpi = 840×1080 px; 2× device-scale for
    // crisp render. Viewport is sized to the bleed box so screen-preview
    // layout measurements match what Puppeteer pages print.
    await page.setViewport({ width: 840, height: 1080, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: "networkidle0", timeout: 60_000 });

    console.log("[export-pdf] waiting for document.fonts.ready…");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    // Settle one frame so any post-mount layout shifts land before print.
    await new Promise((r) => setTimeout(r, 500));

    mkdirSync(OUT_DIR, { recursive: true });
    console.log(`[export-pdf] rendering ${OUT_PATH} at 8.75×11.25in (bleed box)…`);
    await page.pdf({
      path: OUT_PATH,
      width: "8.75in",
      height: "11.25in",
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
