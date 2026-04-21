// Side-by-side: page.screenshot() vs recordVideo, at precisely the same moment
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');

const RAF_SCROLL = `
async (target, dur) => {
  await new Promise((resolve) => {
    const start = performance.now();
    const startY = window.scrollY;
    const delta = target - startY;
    function frame(now) {
      const raw = Math.min(1, (now - start) / dur);
      const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      window.scrollTo({ top: startY + delta * t, behavior: "instant" });
      if (raw < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: '/tmp/compare-video', size: { width: 1920, height: 1080 } },
    deviceScaleFactor: 1,
  });

  await context.addInitScript(() => {
    const FROZEN_MS = 1776670200000;
    const OriginalDate = Date;
    class FrozenDate extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) super(FROZEN_MS);
        else super(...args);
      }
      static now() { return FROZEN_MS; }
    }
    Object.getOwnPropertyNames(OriginalDate).forEach((k) => {
      if (k in FrozenDate) return;
      const d = Object.getOwnPropertyDescriptor(OriginalDate, k);
      if (d) Object.defineProperty(FrozenDate, k, d);
    });
    Date = FrozenDate;
    let s = 546;
    Math.random = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    window.__heroAutoScrollDisabled = true;
  });

  const page = await context.newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
  
  await page.evaluate(() => { window.__heroAutoScrollDisabled = true; window.dispatchEvent(new Event('scroll')); });
  await page.evaluate(() => window.scrollTo({top:0, behavior:'instant'}));
  
  await page.waitForSelector('#how-it-works', { state:'visible', timeout: 3000 }).catch(()=>{});
  await page.waitForFunction(() => document.documentElement.scrollHeight > 6000, { timeout: 3000 }).catch(()=>{});
  
  // Jump straight to max scroll 
  const scrollH1 = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewportH = await page.evaluate(() => window.innerHeight);
  console.log(`Initial: scrollHeight=${scrollH1}, viewportH=${viewportH}`);
  
  // Do pin walk to inflate
  const pinTop = await page.evaluate(() => {
    const el = document.querySelector('[class*="pinContainer"]');
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
  });
  await page.evaluate(`(${RAF_SCROLL})(${pinTop + 6 * 1080 + 200}, 500)`);
  
  const scrollH2 = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`After pin walk: scrollHeight=${scrollH2}`);
  
  // Scroll to bottom
  await page.evaluate(`(${RAF_SCROLL})(${scrollH2 - viewportH}, 1000)`);
  
  const finalState = await page.evaluate(() => ({
    scrollY: window.scrollY,
    wmTop: document.querySelector('.footer-giant-wordmark')?.getBoundingClientRect().top,
    wmBottom: document.querySelector('.footer-giant-wordmark')?.getBoundingClientRect().bottom,
  }));
  console.log(`Final: scrollY=${finalState.scrollY}, wmTop=${finalState.wmTop}, wmBottom=${finalState.wmBottom}`);
  
  // Hold for 2 seconds so the video captures steady state
  await page.waitForTimeout(2000);
  
  // Take screenshot AT THIS MOMENT
  await page.screenshot({ path: '/tmp/live-screenshot.png', fullPage: false });
  
  // Note the performance.now() timestamp (video time reference)
  const videoTimeMs = await page.evaluate(() => performance.now());
  console.log(`Screenshot taken at page.performance.now() = ${videoTimeMs}ms`);
  
  // Also evaluate a unique timestamp-visible marker so we can find it in video
  await page.evaluate(() => {
    const div = document.createElement('div');
    div.id = 'marker-overlay';
    div.style.cssText = 'position:fixed;top:0;left:0;width:100px;height:20px;background:red;color:white;z-index:99999;font-family:monospace;font-size:14px;';
    div.textContent = `MARKER`;
    document.body.appendChild(div);
  });
  await page.waitForTimeout(200);
  
  // Now remove marker
  await page.evaluate(() => {
    document.getElementById('marker-overlay')?.remove();
  });
  await page.waitForTimeout(500); // allow video to capture post-marker state

  const videoHandle = page.video();
  await context.close();
  const rawPath = await videoHandle.path();
  console.log(`Raw video path: ${rawPath}`);
  fs.copyFileSync(rawPath, '/tmp/raw-capture.webm');
  console.log('Raw video saved to /tmp/raw-capture.webm');
  
  await browser.close();
})();
