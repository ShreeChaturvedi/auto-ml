import puppeteer from "puppeteer";
import { resolve } from "node:path";

const URL = "http://localhost:5181";
const OUT = "/tmp/agentD6";

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--font-render-hinting=none"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 840, height: 1080, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await new Promise((r) => setTimeout(r, 400));

  const pages = await page.$$(".page");
  console.log("page count:", pages.length);
  // Pages 24 and 25 are zero-indexed 23 and 24 (manifest is 1-indexed).
  for (const num of [24, 25]) {
    const el = pages[num - 1];
    if (!el) throw new Error(`page ${num} not found`);
    await el.screenshot({ path: resolve(OUT, `p${num}.png`) });
  }
} finally {
  await browser.close();
}
console.log("screenshots written to", OUT);
