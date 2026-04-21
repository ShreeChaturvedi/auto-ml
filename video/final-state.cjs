const { chromium } = require('playwright');

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
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    window.__heroAutoScrollDisabled = true;
  });
  const page = await context.newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo({top:0, behavior:'instant'}));
  
  await page.waitForSelector('#how-it-works', { state:'visible', timeout: 3000 }).catch(()=>{});
  await page.waitForFunction(() => document.documentElement.scrollHeight > 6000, { timeout: 3000 }).catch(()=>{});
  
  // Do the pin walk to fully inflate 
  const pinTop = await page.evaluate(() => {
    const el = document.querySelector('[class*="pinContainer"]');
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : 2000;
  });
  console.log(`pinTop=${pinTop}`);
  
  const PIN_MULTIPLIER = 6;
  const PIN_PHASES = 7;
  const viewportH = 1080;
  const perPhase = (PIN_MULTIPLIER * viewportH) / PIN_PHASES;
  for (let i = 0; i < PIN_PHASES; i++) {
    const target = pinTop + perPhase * (i+1);
    await page.evaluate(`(${RAF_SCROLL})(${target}, 1200)`);
  }
  await page.waitForTimeout(500);
  
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`scrollHeight after pin walk = ${scrollHeight}`);
  await page.evaluate(`(${RAF_SCROLL})(${scrollHeight - viewportH}, 800)`);
  await page.waitForTimeout(1500);
  
  const state = await page.evaluate(() => ({
    scrollY: window.scrollY,
    wmTop: document.querySelector('.footer-giant-wordmark')?.getBoundingClientRect().top,
  }));
  console.log(`Final state: scrollY=${state.scrollY}, wmTop=${state.wmTop}`);
  
  // Full screenshot
  await page.screenshot({ path: '/tmp/fresh-shot.png', fullPage: false, clip: { x: 0, y: 480, width: 1920, height: 600 } });
  
  await context.close();
  await browser.close();
})();
