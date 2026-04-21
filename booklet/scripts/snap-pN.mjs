/**
 * Snap page N (1-indexed) of the booklet to /tmp/agentE3/<name>.png.
 * Usage: node scripts/snap-pN.mjs 6 p6-before
 */
import puppeteer from "puppeteer";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const URL = process.env.BOOKLET_URL ?? "http://localhost:5181";
const N = parseInt(process.argv[2] ?? "6", 10);
const NAME = process.argv[3] ?? `p${N}`;
const OUTDIR = process.env.OUTDIR ?? "/tmp/agentE3";
mkdirSync(OUTDIR, { recursive: true });
const OUT = resolve(`${OUTDIR}/${NAME}.png`);

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--font-render-hinting=none"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 840, height: 1080, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(
    (n) => document.querySelectorAll(".page").length >= n,
    { timeout: 30_000 },
    N,
  );
  await new Promise((r) => setTimeout(r, 800));
  const rect = await page.evaluate((n) => {
    const p = document.querySelectorAll(".page")[n - 1];
    if (!p) return null;
    window.scrollTo(0, 0);
    const r = p.getBoundingClientRect();
    return {
      x: r.x + window.scrollX,
      y: r.y + window.scrollY,
      width: r.width,
      height: r.height,
      n: document.querySelectorAll(".page").length,
    };
  }, N);
  if (!rect) throw new Error(`page ${N} not found`);
  console.log("rect:", rect);
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
