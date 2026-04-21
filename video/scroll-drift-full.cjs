// Full pin-walk replication to observe scrollY + geometry stability during Phase O
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
  
  await page.evaluate(() => {
    window.__heroAutoScrollDisabled = true;
    window.dispatchEvent(new Event('scroll'));
  });
  await page.evaluate(() => window.scrollTo({top:0, behavior:'instant'}));
  
  const viewportH = await page.evaluate(() => window.innerHeight);
  
  await page.waitForSelector('#how-it-works', { state:'visible', timeout: 3000 }).catch(()=>{});
  await page.waitForFunction(() => document.documentElement.scrollHeight > 6000, { timeout: 3000 }).catch(()=>{});
  
  let scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`INIT: viewportH=${viewportH} scrollHeight=${scrollHeight}`);
  
  // Phase A: top hold
  await page.waitForTimeout(2500);
  // Phase B: scroll to 800
  await page.evaluate(`(${RAF_SCROLL})(800, 3000)`);
  // Phase C: pause
  await page.waitForTimeout(2000);
  // Phase D: scroll to pinTop
  const pinTop = await page.evaluate(() => {
    const el = document.querySelector('[class*="pinContainer"]');
    if (el) return Math.round(el.getBoundingClientRect().top + window.scrollY);
    return null;
  });
  console.log(`pinTop=${pinTop}`);
  await page.evaluate(`(${RAF_SCROLL})(${Math.max(0, pinTop - 100)}, 1500)`);
  // Phase E: pause  
  await page.waitForTimeout(1500);
  
  // Phase F: 7 pinned-phase walk
  const PIN_MULTIPLIER = 6;
  const PIN_PHASES = 7;
  const perPhase = (PIN_MULTIPLIER * viewportH) / PIN_PHASES;
  for (let i = 0; i < PIN_PHASES; i++) {
    const target = pinTop + perPhase * (i+1);
    await page.evaluate(`(${RAF_SCROLL})(${target}, 1200)`);
    await page.waitForTimeout(1600);
  }
  
  // Phase F'
  await page.evaluate(`(${RAF_SCROLL})(${pinTop + perPhase*PIN_PHASES + 200}, 800)`);
  
  // Skip G-M for speed, jump to N
  scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`Before Phase N: scrollHeight=${scrollHeight}`);
  await page.evaluate(`(${RAF_SCROLL})(${scrollHeight - viewportH}, 2500)`);
  
  // Log scrollY + wmTop + scrollHeight at 10Hz during Phase O (3 seconds)
  const postNScrollY = await page.evaluate(() => window.scrollY);
  const postNHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`After Phase N scroll: scrollY=${postNScrollY}, scrollHeight=${postNHeight}`);
  
  const phaseOStart = Date.now();
  // Cursor move (same as real driver)
  const footerCta = await page.locator('.footer-cta-button').boundingBox();
  if (footerCta) {
    await page.mouse.move(
      Math.round(footerCta.x + footerCta.width / 2),
      Math.round(footerCta.y + footerCta.height / 2),
      { steps: 6 }
    );
  }
  
  console.log('\n--- PHASE O (2.5s pause) ---');
  console.log('t(ms) | scrollY | wmTop | scrollHeight');
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(50);
    const data = await page.evaluate(() => {
      const wm = document.querySelector('.footer-giant-wordmark');
      const rect = wm?.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        wmTop: rect?.top ?? null,
        sh: document.documentElement.scrollHeight,
      };
    });
    const t = Date.now() - phaseOStart;
    console.log(`${t} | ${data.scrollY.toFixed(3)} | ${data.wmTop?.toFixed(3)} | ${data.sh}`);
  }

  await context.close();
  await browser.close();
})();
