// Trace exact timing of each phase in driver using webm time reference
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
  const contextStartWall = performance.now();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: '/tmp/phase-trace-video', size: { width: 1920, height: 1080 } },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => { window.__heroAutoScrollDisabled = true; });
  const page = await context.newPage();
  const navStart = performance.now() - contextStartWall;
  console.log(`[${navStart.toFixed(0)}ms] start navigation`);
  await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });
  const navEnd = performance.now() - contextStartWall;
  console.log(`[${navEnd.toFixed(0)}ms] goto complete`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle').catch(()=>{});
  await page.waitForTimeout(500);
  const ready = performance.now() - contextStartWall;
  console.log(`[${ready.toFixed(0)}ms] ready`);
  
  await page.evaluate(() => { window.__heroAutoScrollDisabled = true; window.dispatchEvent(new Event('scroll')); });
  await page.evaluate(() => window.scrollTo({top:0, behavior:'instant'}));
  await page.waitForSelector('#how-it-works', { state:'visible', timeout: 3000 }).catch(()=>{});
  await page.waitForFunction(() => document.documentElement.scrollHeight > 6000, { timeout: 3000 }).catch(()=>{});
  
  const PhaseA = performance.now() - contextStartWall;
  console.log(`[${PhaseA.toFixed(0)}ms] Phase A start`);
  await page.waitForTimeout(2500);
  
  const PhaseB = performance.now() - contextStartWall;
  console.log(`[${PhaseB.toFixed(0)}ms] Phase B start (scroll to 800 over 3s)`);
  await page.evaluate(`(${RAF_SCROLL})(800, 3000)`);
  
  const PhaseC = performance.now() - contextStartWall;
  console.log(`[${PhaseC.toFixed(0)}ms] Phase C start (2s pause)`);
  await page.waitForTimeout(2000);
  
  const pinTop = await page.evaluate(() => {
    const el = document.querySelector('[class*="pinContainer"]');
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : 2000;
  });
  const PhaseD = performance.now() - contextStartWall;
  console.log(`[${PhaseD.toFixed(0)}ms] Phase D start (scroll to pinTop=${pinTop})`);
  await page.evaluate(`(${RAF_SCROLL})(${Math.max(0, pinTop - 100)}, 1500)`);
  
  const PhaseE = performance.now() - contextStartWall;
  console.log(`[${PhaseE.toFixed(0)}ms] Phase E start (1.5s pause)`);
  await page.waitForTimeout(1500);
  
  const PhaseF = performance.now() - contextStartWall;
  console.log(`[${PhaseF.toFixed(0)}ms] Phase F start (7 phases × 1.2s+1.6s)`);
  const PIN_MULTIPLIER = 6;
  const PIN_PHASES = 7;
  const viewportH = 1080;
  const perPhase = (PIN_MULTIPLIER * viewportH) / PIN_PHASES;
  for (let i = 0; i < PIN_PHASES; i++) {
    await page.evaluate(`(${RAF_SCROLL})(${pinTop + perPhase * (i+1)}, 1200)`);
    await page.waitForTimeout(1600);
  }
  
  const PhaseFprime = performance.now() - contextStartWall;
  console.log(`[${PhaseFprime.toFixed(0)}ms] Phase F' (0.8s tail scroll)`);
  await page.evaluate(`(${RAF_SCROLL})(${pinTop + perPhase*PIN_PHASES + 200}, 800)`);
  
  // Skip G, H, I, J for speed
  // Feature chats: each ~3s
  const PhaseG = performance.now() - contextStartWall;
  console.log(`[${PhaseG.toFixed(0)}ms] Phases G/H/I/J (skip for speed - mock as 8s wait)`);
  await page.waitForTimeout(8000);
  
  const PhaseKLM = performance.now() - contextStartWall;
  console.log(`[${PhaseKLM.toFixed(0)}ms] Phases K/L/M (4s)`);
  await page.waitForTimeout(4000);
  
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const PhaseN = performance.now() - contextStartWall;
  console.log(`[${PhaseN.toFixed(0)}ms] Phase N start (scroll to bottom=${scrollHeight-viewportH} over 2.5s)`);
  await page.evaluate(`(${RAF_SCROLL})(${scrollHeight - viewportH}, 2500)`);
  
  const PhaseO = performance.now() - contextStartWall;
  console.log(`[${PhaseO.toFixed(0)}ms] Phase O start (2.5s pause at bottom)`);
  await page.waitForTimeout(2500);
  
  const PhaseP = performance.now() - contextStartWall;
  console.log(`[${PhaseP.toFixed(0)}ms] Phase P start (cursor sweep)`);
  const navCta = await page.locator('a.nav-cta').boundingBox();
  await page.mouse.move(
    Math.round(navCta.x + navCta.width / 2),
    Math.round(navCta.y + navCta.height / 2),
    { steps: 50 }
  );
  
  const PhaseQ = performance.now() - contextStartWall;
  console.log(`[${PhaseQ.toFixed(0)}ms] Phase Q start (click + 1.1s tail)`);
  await page.waitForTimeout(1100);
  
  const totalTime = performance.now() - contextStartWall;
  console.log(`[${totalTime.toFixed(0)}ms] END`);
  
  await context.close();
  await browser.close();
})();
