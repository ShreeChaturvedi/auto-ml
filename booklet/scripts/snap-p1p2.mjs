/**
 * Captures pages 1 and 2 stacked vertically into a single 2-up image so we
 * can judge cover ↔ endpaper cohesion at a glance.
 */
import puppeteer from "puppeteer";
import { resolve } from "node:path";

const URL = process.env.BOOKLET_URL ?? "http://localhost:5181";
const OUT = resolve("/tmp/agentD8/p1p2-stack.png");

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--font-render-hinting=none"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 840, height: 1080, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => document.querySelectorAll(".page").length >= 2, { timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 800));
  const rects = await page.evaluate(() => {
    window.scrollTo(0, 0);
    const pages = document.querySelectorAll(".page");
    const get = (i) => {
      const r = pages[i].getBoundingClientRect();
      return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
    };
    return [get(0), get(1)];
  });
  // Union clip = from top of page0 to bottom of page1, spanning the wider page.
  const minX = Math.min(rects[0].x, rects[1].x);
  const maxRight = Math.max(rects[0].x + rects[0].w, rects[1].x + rects[1].w);
  const minY = Math.min(rects[0].y, rects[1].y);
  const maxBottom = Math.max(rects[0].y + rects[0].h, rects[1].y + rects[1].h);
  await page.screenshot({
    path: OUT,
    clip: {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(maxRight - minX),
      height: Math.round(maxBottom - minY),
    },
  });
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
