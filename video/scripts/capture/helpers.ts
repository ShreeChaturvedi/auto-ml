/**
 * Shared Playwright driver helpers. Kept in a thin module so every per-beat
 * driver agrees on how to measure DOM rectangles + page geometry without
 * circular deps.
 */
import type { Page } from "playwright";

export type BoxCenter = { x: number; y: number };

/**
 * Measure the center of the first element matching `selector`. Throws on
 * miss — drivers should assert layout invariants up front so a missing
 * element fails fast rather than silently recording a bad cursor track.
 */
export async function centerOf(page: Page, selector: string): Promise<BoxCenter> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`[capture] locator not visible: ${selector}`);
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

/**
 * Read `document.documentElement.scrollHeight` (total scrollable height in px).
 */
export async function getScrollHeight(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight);
}

/**
 * Read `window.innerHeight`.
 */
export async function getViewportHeight(page: Page): Promise<number> {
  return page.evaluate(() => window.innerHeight);
}

/**
 * Read the absolute top of the first element matching `selector` in page
 * coordinates (adjusted for current scroll position). Handy for locating a
 * pin anchor before doing rAF scrolls that target it. Returns null when the
 * element isn't on the page.
 */
export async function pageTopOf(
  page: Page,
  selector: string,
): Promise<number | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return Math.round(rect.top + window.scrollY);
  }, selector);
}
