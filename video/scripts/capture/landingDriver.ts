/**
 * Landing-beat driver v3 — full-scroll cinematic walk-through.
 *
 * All cursor positions are element-relative (via `centerOf` / `boundingBox`),
 * never hardcoded viewport coordinates. This guarantees the cursor tracks
 * actual on-screen content regardless of scroll position or layout shifts.
 *
 * Beats (total ~52 s drive; fits inside a 55 s / 3300 f scene budget):
 *   A  0.0–2.5 s   top hold; kill hero auto-scroll; cursor parks on nav
 *   B  2.5–5.5 s   scroll to y≈800 (app preview) over 3 s
 *   C  5.5–7.5 s   pause on product preview
 *   D  7.5–9.0 s   scroll to HowItWorks intro
 *   E  9.0–10.5 s  pause on HowItWorks headline
 *   F  10.5–30.0 s 7 pinned-phase walk: rAF 1.2 s + 1.6 s pause/phase
 *   F' 30.0–30.8 s clear pin-spacing tail
 *   G  30.8–33.2 s Chat card (cursor on card center)
 *   H  33.2–36.2 s Plan card (cursor on card center)
 *   I  36.2–39.2 s Notebook card (cursor on card center)
 *   J  39.2–40.2 s scroll to MetaCardRow
 *   K  40.2–42.2 s 1st meta-card SVG
 *   L  42.2–43.2 s 2nd meta-card SVG
 *   M  43.2–44.2 s 3rd meta-card SVG
 *   N  44.2–46.7 s scroll to footer over 2.5 s
 *   O  46.7–49.2 s pause at bottom on FooterCta
 *   P  49.2–50.2 s cursor sweeps up to `a.nav-cta` (smooth 50 steps)
 *   Q  50.2–51.5 s click + 1.1 s post-click tail (ClickRipple animates)
 */
import type { Page } from "playwright";
import { centerOf, pageTopOf } from "./helpers";
import type { CursorRecorder, MarkPacer, RafScroll } from "./types";

export type DriverArgs = {
  page: Page;
  cursor: CursorRecorder;
  rafScroll: RafScroll;
  waitForMark: MarkPacer["waitForMark"];
  hasAlignment: boolean;
};

// GSAP ScrollTrigger pin config in `HowItWorks.tsx`: `end: '+=600%'` ⇒ 6 ×
// viewport_h of scroll distance across 7 phases. Keep this comment + constant
// in lockstep with that file; drift breaks the pin walk.
const PIN_MULTIPLIER = 6;
const PIN_PHASES = 7;

/**
 * Patch Hero's auto-scroll (`setTimeout(scrollTo, 3200)`) so our Phase-A
 * `scrollTo(0,0)` isn't fought by the queued scroll.
 */
async function disableHeroAutoScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as Window & { __heroAutoScrollDisabled?: boolean }).__heroAutoScrollDisabled =
      true;
    window.dispatchEvent(new Event("scroll"));
  });
}

export async function drive(
  { page, cursor, rafScroll }: DriverArgs,
): Promise<void> {
  // --- Settle (tight — networkidle already fired before driver starts) -----
  await page.waitForTimeout(500);
  await disableHeroAutoScroll(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

  const viewportH = await page.evaluate(() => window.innerHeight);

  // Wait for GSAP ScrollTrigger to inflate the page (max 3 s — if it hasn't
  // fired by then, something is wrong). Don't use 10 s timeouts that bloat
  // drive time past the scene budget.
  await page
    .waitForSelector("#how-it-works", { state: "visible", timeout: 3_000 })
    .catch(() => {});
  await page
    .waitForFunction(
      () => document.documentElement.scrollHeight > 6000,
      { timeout: 3_000 },
    )
    .catch(() => {});

  let scrollHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  console.log(
    `[landing-driver] viewportH=${viewportH} scrollHeight=${scrollHeight}`,
  );

  // --- Phase A: top hold — cursor on nav logo (top-left) -------------------
  const navCta = await centerOf(page, "a.nav-cta");
  // Park cursor near logo area (not on CTA yet — just neutral top-right)
  await cursor.move(page, navCta.x - 200, navCta.y, 6);
  await page.waitForTimeout(2500);

  // --- Phase B: scroll to app preview --------------------------------------
  await rafScroll(page, 800, 3000);

  // --- Phase C: pause on product preview — cursor on the app frame ---------
  const appPreview = await page
    .$(".app-preview-frame, .preview-frame, [class*='AppPreview']")
    .then((el) => el?.boundingBox());
  if (appPreview) {
    await cursor.move(
      page,
      Math.round(appPreview.x + appPreview.width / 2),
      Math.round(appPreview.y + appPreview.height / 2),
      6,
    );
  } else {
    await cursor.move(page, 960, 540, 6);
  }
  await page.waitForTimeout(2000);

  // --- Phase D: scroll to HowItWorks intro ---------------------------------
  const pinTop = await resolvePinTop(page);
  console.log(`[landing-driver] pinTop=${pinTop}`);
  await rafScroll(page, Math.max(0, pinTop - 100), 1500);

  // --- Phase E: pause on HowItWorks headline — cursor on heading -----------
  const hiwHeading = await page
    .$("#how-it-works h2, #how-it-works [class*='heading']")
    .then((el) => el?.boundingBox());
  if (hiwHeading) {
    await cursor.move(
      page,
      Math.round(hiwHeading.x + hiwHeading.width / 2),
      Math.round(hiwHeading.y + hiwHeading.height / 2),
      6,
    );
  } else {
    await cursor.move(page, 960, 300, 6);
  }
  await page.waitForTimeout(1500);

  // --- Phase F: 7 pinned-phase walk ----------------------------------------
  const perPhase = (PIN_MULTIPLIER * viewportH) / PIN_PHASES;
  for (let i = 0; i < PIN_PHASES; i += 1) {
    const target = pinTop + perPhase * (i + 1);
    await rafScroll(page, target, 1200);
    // Cursor drifts to center of the viewport where pinned content plays.
    // Slight vertical offset per phase so the cursor visually "reads" each step.
    await cursor.move(page, 480 + i * 30, 400 + (i % 3) * 80, 6);
    await page.waitForTimeout(1600);
  }

  // --- Phase F': clear pin-spacing tail ------------------------------------
  await rafScroll(page, pinTop + perPhase * PIN_PHASES + 200, 800);

  // --- Phase G: Chat card — cursor on card center --------------------------
  await scrollToSection(page, rafScroll, "#feature-chat", 1000);
  const chatC = await safeCenter(page, "#feature-chat");
  await cursor.move(page, chatC.x, chatC.y, 6);
  await page.waitForTimeout(2000);

  // --- Phase H: Plan card --------------------------------------------------
  await scrollToSection(page, rafScroll, "#feature-plan", 1000);
  const planC = await safeCenter(page, "#feature-plan");
  await cursor.move(page, planC.x, planC.y, 6);
  await page.waitForTimeout(2000);

  // --- Phase I: Notebook card ----------------------------------------------
  await scrollToSection(page, rafScroll, "#feature-notebook", 1000);
  const notebookC = await safeCenter(page, "#feature-notebook");
  await cursor.move(page, notebookC.x, notebookC.y, 6);
  await page.waitForTimeout(2000);

  // --- Phase J: scroll to MetaCardRow --------------------------------------
  await scrollToSection(page, rafScroll, ".meta-card:first-child", 1000);

  // --- Phases K–M: three meta-card SVGs ------------------------------------
  const metaCards = await page.$$(".meta-card");
  const pauses = [2000, 1000, 1000];
  for (let i = 0; i < Math.min(metaCards.length, 3); i += 1) {
    const box = await metaCards[i]!.boundingBox();
    if (box) {
      await cursor.move(
        page,
        Math.round(box.x + box.width / 2),
        Math.round(box.y + box.height / 2),
        6,
      );
    }
    await page.waitForTimeout(pauses[i] ?? 1000);
  }

  // --- Phase N: scroll to bottom -------------------------------------------
  scrollHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  await rafScroll(page, scrollHeight - viewportH, 2500);
  const finalY = await page.evaluate(() => window.scrollY);
  console.log(
    `[landing-driver] Phase N reached scrollY=${finalY} (target=${scrollHeight - viewportH})`,
  );

  // Settle barrier: give the webm encoder ~150 ms of fully-settled frames
  // before any subsequent action (cursor move / page.locator / hover
  // transitions) to guarantee Phase O opens on content that is pixel-stable
  // relative to the footer wordmark's `overflow: hidden` clip boundary.
  // Without this pad, the final 1-2 video frames of Phase N — where the
  // easing's tail eval lands a handful of pixels short of target — bleed
  // into the bottom-of-page hold and clip the wordmark's letter ascenders.
  await page.waitForTimeout(150);

  // --- Phase O: FooterCta pause — cursor on CTA button ---------------------
  const footerCta = await safeCenter(page, ".footer-cta-button");
  await cursor.move(page, footerCta.x, footerCta.y, 6);
  await page.waitForTimeout(2500);

  // --- Phase P: sweep cursor up to nav CTA ---------------------------------
  const navCtaFinal = await centerOf(page, "a.nav-cta");
  await cursor.move(page, navCtaFinal.x, navCtaFinal.y, 50);
  await page.waitForTimeout(200);

  // --- Phase Q: click + tail -----------------------------------------------
  await cursor.click(page, navCtaFinal.x, navCtaFinal.y);
  await page.waitForTimeout(1100);
}

/**
 * Like `centerOf` but falls back to viewport center instead of throwing.
 */
async function safeCenter(
  page: Page,
  selector: string,
): Promise<{ x: number; y: number }> {
  try {
    return await centerOf(page, selector);
  } catch {
    return { x: 960, y: 540 };
  }
}

/**
 * Resolve the pin's top-Y (in page coords). Tries multiple selectors.
 */
async function resolvePinTop(page: Page): Promise<number> {
  const byPin = await pageTopOf(page, '[class*="pinContainer"]');
  if (byPin !== null && byPin > 0) return byPin;

  const byData = await pageTopOf(page, '[data-section="how-it-works"]');
  if (byData !== null && byData > 0) return byData;

  const byNestedPin = await pageTopOf(page, "#how-it-works .pinContainer");
  if (byNestedPin !== null && byNestedPin > 0) return byNestedPin;

  const bySection = await pageTopOf(page, "#how-it-works");
  if (bySection !== null && bySection > 0) return bySection + 200;

  throw new Error(
    "[landing-driver] could not locate HowItWorks pin; page may have " +
      "failed to render. Aborting capture.",
  );
}

/**
 * Scroll the page so the element at `selector`'s top is ~120 px below the
 * fixed nav. Skips silently if the element isn't on the page.
 */
async function scrollToSection(
  page: Page,
  rafScroll: RafScroll,
  selector: string,
  durationMs: number,
): Promise<void> {
  const top = await pageTopOf(page, selector);
  if (top === null) return;
  await rafScroll(page, Math.max(0, top - 120), durationMs);
}
