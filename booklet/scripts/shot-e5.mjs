import puppeteer from "puppeteer";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5181";
const OUT = process.argv[2] || "/tmp/agentE5";
const PAGES = [4, 8, 16, 20, 23];

mkdirSync(OUT, { recursive: true });

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
  await new Promise((r) => setTimeout(r, 600));

  const pages = await page.$$(".page");
  console.log("page count:", pages.length);
  for (const num of PAGES) {
    const el = pages[num - 1];
    if (!el) throw new Error(`page ${num} not found`);
    await el.screenshot({ path: resolve(OUT, `p${num}.png`) });
  }
} finally {
  await browser.close();
}
console.log("screenshots written to", OUT);
