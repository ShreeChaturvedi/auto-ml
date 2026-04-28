/**
 * Agent D8 p2 snapshotter. Spawns headless Chromium, sizes the viewport to
 * 8.5×11" at 150dpi (= 1275×1650), waits for fonts, then clips a screenshot
 * of the endpaper page bounding-rect to /tmp/agentD8/<name>.png.
 */
import puppeteer from "puppeteer";
import { resolve } from "node:path";

const URL = process.env.BOOKLET_URL ?? "http://localhost:5181";
const NAME = process.argv[2] ?? "p2";
const OUT = resolve(`/tmp/agentD8/${NAME}.png`);

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--font-render-hinting=none"],
});
try {
  const page = await browser.newPage();
  // 8.75×11.25 bleed box at 150dpi ≈ 1312×1688. deviceScaleFactor kept at 1
  // so exact pixel counts match screenshot clip.
  // Viewport in CSS px (bleed-box 8.75×11.25in at 96dpi). deviceScaleFactor
  // = 2 gives a 192 "effective dpi" render ≈ the visual quality of a print
  // preview at 150dpi without blowing past puppeteer's clip math.
  await page.setViewport({ width: 840, height: 1080, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => document.querySelectorAll(".page").length >= 2, { timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 800));
  // Compute ABSOLUTE document-space rect of the endpaper (2nd .page).
  // page.screenshot({clip}) uses document coords, not viewport coords.
  const rect = await page.evaluate(() => {
    const p = document.querySelectorAll(".page")[1];
    if (!p) return null;
    // Scroll to top first so getBoundingClientRect + window.scrollY gives
    // a stable document-space origin.
    window.scrollTo(0, 0);
    const r = p.getBoundingClientRect();
    return {
      x: r.x + window.scrollX,
      y: r.y + window.scrollY,
      width: r.width,
      height: r.height,
      n: document.querySelectorAll(".page").length,
    };
  });
  if (!rect) throw new Error(`endpaper not found (rect null)`);
  console.log("rect:", rect);
  // rect is in CSS px relative to viewport top after scroll; take full-page
  // screenshot scoped to that rect.
  await page.screenshot({
    path: OUT,
    clip: {
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  });
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
