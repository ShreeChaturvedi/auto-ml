// Capture both page.screenshot AND wait for webm encoding at SAME instant
// using CDP directly for maximum control
const { chromium } = require('playwright');
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
    recordVideo: { dir: '/tmp/deep-compare-video', size: { width: 1920, height: 1080 } },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => { window.__heroAutoScrollDisabled = true; });
  const page = await context.newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  
  await page.waitForSelector('#how-it-works', { state:'visible', timeout: 3000 }).catch(()=>{});
  await page.waitForFunction(() => document.documentElement.scrollHeight > 6000, { timeout: 3000 }).catch(()=>{});
  
  const pinTop = await page.evaluate(() => {
    const el = document.querySelector('[class*="pinContainer"]');
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : 2000;
  });
  
  const PIN_MULTIPLIER = 6;
  const PIN_PHASES = 7;
  const viewportH = 1080;
  const perPhase = (PIN_MULTIPLIER * viewportH) / PIN_PHASES;
  for (let i = 0; i < PIN_PHASES; i++) {
    await page.evaluate(`(${RAF_SCROLL})(${pinTop + perPhase * (i+1)}, 600)`);
  }
  await page.waitForTimeout(500);
  
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate(`(${RAF_SCROLL})(${scrollHeight - 1080}, 800)`);
  await page.waitForTimeout(1500);  // Let animations settle
  
  // Freeze animations using CDP
  const client = await context.newCDPSession(page);
  // Pause all animations
  await client.send('Animation.setPlaybackRate', { playbackRate: 0 });
  
  const state = await page.evaluate(() => ({
    scrollY: window.scrollY,
    wmTop: document.querySelector('.footer-giant-wordmark')?.getBoundingClientRect().top,
  }));
  console.log(`Final state: scrollY=${state.scrollY}, wmTop=${state.wmTop}`);
  
  // Take SYNCHRONIZED screenshot and let video continue for 1s
  await page.screenshot({ path: '/tmp/deep-shot.png', fullPage: false });
  // Also get raw CDP screenshot  
  const cdpShot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  fs.writeFileSync('/tmp/deep-cdp-shot.png', Buffer.from(cdpShot.data, 'base64'));
  
  await page.waitForTimeout(1500); // make sure video captures post-screenshot
  
  const videoHandle = page.video();
  await context.close();
  const rawPath = await videoHandle.path();
  fs.copyFileSync(rawPath, '/tmp/deep-raw.webm');
  console.log(`Raw saved, path was: ${rawPath}`);
  
  await browser.close();
})();
