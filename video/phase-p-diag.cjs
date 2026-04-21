// Diagnostic: replicate Phase P cursor sweep and log scrollY + wmTop
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
  await context.addInitScript(() => { window.__heroAutoScrollDisabled = true; });
  const page = await context.newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.documentElement.scrollHeight > 6000, { timeout: 3000 }).catch(()=>{});
  
  // Pin walk to inflate
  const pinTop = await page.evaluate(() => {
    const el = document.querySelector('[class*="pinContainer"]');
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : 2000;
  });
  const PIN_MULTIPLIER = 6;
  const PIN_PHASES = 7;
  const viewportH = 1080;
  const perPhase = (PIN_MULTIPLIER * viewportH) / PIN_PHASES;
  for (let i = 0; i < PIN_PHASES; i++) {
    await page.evaluate(`(${RAF_SCROLL})(${pinTop + perPhase * (i+1)}, 300)`);
  }
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`scrollHeight=${scrollHeight}`);
  
  // Scroll to bottom (Phase N)
  await page.evaluate(`(${RAF_SCROLL})(${scrollHeight - 1080}, 800)`);
  await page.waitForTimeout(1500); // Phase O partial
  
  const afterO = await page.evaluate(() => ({
    scrollY: window.scrollY,
    wmTop: document.querySelector('.footer-giant-wordmark')?.getBoundingClientRect().top,
  }));
  console.log(`Start of Phase P: scrollY=${afterO.scrollY}, wmTop=${afterO.wmTop}`);
  
  // Phase P: cursor sweep from footer to nav CTA (top)
  const footerCta = await page.locator('.footer-cta-button').boundingBox();
  const navCta = await page.locator('a.nav-cta').boundingBox();
  console.log(`footerCta=${JSON.stringify(footerCta)}, navCta=${JSON.stringify(navCta)}`);
  
  // Park cursor at footer first
  await page.mouse.move(
    Math.round(footerCta.x + footerCta.width / 2),
    Math.round(footerCta.y + footerCta.height / 2),
    { steps: 6 }
  );
  
  console.log('\n--- Phase P: cursor sweep (50 steps) ---');
  const startTime = Date.now();
  
  // Parallel log + move  
  let running = true;
  const logInterval = setInterval(async () => {
    try {
      const data = await page.evaluate(() => ({
        scrollY: window.scrollY,
        wmTop: document.querySelector('.footer-giant-wordmark')?.getBoundingClientRect().top,
      }));
      console.log(`t=${Date.now() - startTime}ms scrollY=${data.scrollY.toFixed(3)} wmTop=${data.wmTop?.toFixed(3)}`);
    } catch {}
  }, 50);
  
  // Sweep cursor to navCta
  await page.mouse.move(
    Math.round(navCta.x + navCta.width / 2),
    Math.round(navCta.y + navCta.height / 2),
    { steps: 50 }
  );
  
  clearInterval(logInterval);
  running = false;
  
  await page.waitForTimeout(1200);
  
  const afterP = await page.evaluate(() => ({
    scrollY: window.scrollY,
    wmTop: document.querySelector('.footer-giant-wordmark')?.getBoundingClientRect().top,
  }));
  console.log(`After Phase P: scrollY=${afterP.scrollY}, wmTop=${afterP.wmTop}`);

  await context.close();
  await browser.close();
})();
