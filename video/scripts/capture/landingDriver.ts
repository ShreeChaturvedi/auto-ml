/**
 * Landing-beat driver. Scrolls through the marketing page, letting sections
 * breathe. No form interactions → no cursor clicks. Total drive time is ~13 s,
 * well inside the 60 s envelope declared on the landing `demo` scene.
 */
import type { Page } from "playwright";
import type { CursorRecorder, MarkPacer, RafScroll } from "./types";

export type DriverArgs = {
  page: Page;
  cursor: CursorRecorder;
  rafScroll: RafScroll;
  waitForMark: MarkPacer["waitForMark"];
  hasAlignment: boolean;
};

export async function drive({ page, cursor, rafScroll }: DriverArgs): Promise<void> {
  // Settle: let fonts/images commit to first frame.
  await page.waitForTimeout(1500);

  const scrollHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  const viewportH = await page.evaluate(() => window.innerHeight);

  // Park the cursor off-screen right at start so the SyntheticCursor overlay
  // enters from a neutral position.
  await cursor.move(page, 1700, 120, 10);

  // Scroll 1: hero → mid-page. Slow, cinematic (5 s).
  const midY = Math.min(scrollHeight - viewportH, 2200);
  await rafScroll(page, midY, 5000);
  await page.waitForTimeout(1000);
  // Drift toward a feature card area so the cursor overlay tracks with the gaze.
  await cursor.move(page, 960, 520, 30);
  await page.waitForTimeout(1000);

  // Scroll 2: mid → deeper, if the page is tall enough.
  if (scrollHeight > viewportH * 2.5) {
    const deepY = Math.min(scrollHeight - viewportH, 4200);
    await rafScroll(page, deepY, 3500);
    await page.waitForTimeout(1500);
  }

  // Return to top for visual bookend (3 s).
  await rafScroll(page, 0, 3000);
  await cursor.move(page, 1200, 100, 20); // settle near nav CTA
  await page.waitForTimeout(1200);
}
