/**
 * Home-beat driver. Post-login home page. Only 240 frames (4 s @ 60 fps) so
 * the drive is deliberately minimal — the scene's job is to show the
 * "Good afternoon, Ayush" greeting + empty-state with the mac chrome framing
 * it. We idle, let the stars background animate, then drift the cursor to a
 * natural resting point near the greeting.
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

export async function drive({ page, cursor }: DriverArgs): Promise<void> {
  // Budget: scene is 240 frames (4 s @ 60 fps). Orchestrator burns ~0 ms of
  // capture-clock overhead (navigate is anchored to context creation, not
  // drive start). Everything below must fit inside ~4 s of wall time or the
  // scene truncates mid-motion.
  //
  // Settle: HomePage has staggered entry animations (100/200/300/400/500 ms
  // delays). Wait through the stagger so the first frames aren't half-painted.
  await page.waitForTimeout(700);

  // Park cursor to the right, above the card, so the overlay enters from a
  // believable neutral spot.
  await cursor.move(page, 1480, 180, 10);
  await page.waitForTimeout(300);

  // Gentle drift toward the "Good afternoon" greeting — anchors the viewer's
  // eye on the personalized copy that sold the auth flow.
  await cursor.move(page, 320, 80, 25);
  await page.waitForTimeout(500);

  // Final settle near the empty-state CTA so the last visible frame isn't a
  // cursor mid-motion. Shorter than the drift so we stay under the 4 s cap.
  await cursor.move(page, 864, 460, 20);
  await page.waitForTimeout(300);
}
