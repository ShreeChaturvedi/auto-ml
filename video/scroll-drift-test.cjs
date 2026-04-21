// Diagnostic: replicate the landing driver's phase-N scroll-to-bottom
// and Phase-O pause, logging scrollY + wordmark rect at high frequency
// to determine if scrollY drifts during the 2.5s pause.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: '/tmp/drift-video', size: { width: 1920, height: 1080 } },
    deviceScaleFactor: 1,
  });

  // Same determinism script as the real capture
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
    // eslint-disable-next-line no-global-assign
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

  // Wait for GSAP inflation
  await page.waitForFunction(() => document.documentElement.scrollHeight > 6000, { timeout: 5000 }).catch(() => {});
  
  // Jump straight to bottom - skip the rAF walk for this test
  const scrollH = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewportH = await page.evaluate(() => window.innerHeight);
  const target = scrollH - viewportH;
  console.log(`scrollHeight=${scrollH} viewportH=${viewportH} target=${target}`);
  
  // rAF scroll to bottom over 2.5s
  await page.evaluate(async (targetY) => {
    await new Promise((resolve) => {
      const start = performance.now();
      const startY = window.scrollY;
      const delta = targetY - startY;
      const dur = 2500;
      function frame(now) {
        const raw = Math.min(1, (now - start) / dur);
        const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        window.scrollTo({ top: startY + delta * t, behavior: 'instant' });
        if (raw < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }, target);

  const immediateScrollY = await page.evaluate(() => window.scrollY);
  console.log(`Immediately after rAF scroll: scrollY=${immediateScrollY}`);
  
  // Record scrollY at high frequency for 3 seconds
  // Replicate Phase O: cursor move + 2.5s pause
  const startTime = Date.now();
  const footerCta = await page.locator('.footer-cta-button').boundingBox();
  if (footerCta) {
    await page.mouse.move(
      Math.round(footerCta.x + footerCta.width / 2),
      Math.round(footerCta.y + footerCta.height / 2),
      { steps: 6 }
    );
  }
  
  // Log scrollY at 20 Hz for 3 seconds
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(50);
    const data = await page.evaluate(() => {
      const wm = document.querySelector('.footer-giant-wordmark');
      const rect = wm?.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        wmTop: rect?.top ?? null,
        wmBottom: rect?.bottom ?? null,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    const t = Date.now() - startTime;
    console.log(`t=${t}ms scrollY=${data.scrollY.toFixed(3)} wmTop=${data.wmTop?.toFixed(3)} sH=${data.scrollHeight}`);
  }

  await context.close();
  await browser.close();
})();
