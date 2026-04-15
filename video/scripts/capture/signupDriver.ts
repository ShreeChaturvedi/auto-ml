/**
 * Signup-beat driver. Types credentials into the real SignupForm at
 * `http://localhost:5173/signup`, clicks Continue, and lets the mocked
 * `/api/auth/register` response trigger SignupForm's 500 ms redirect to `/`.
 *
 * Budget: the scene is 900 frames (15 s @ 60 fps). The orchestrator burns
 * ~5 s on `newContext → goto → fonts.ready → networkidle` before the driver
 * runs, so this drive has to fit inside ~9 s to keep the submit click visible
 * inside the scene window. Every per-keypress/per-click delay is tuned to hit
 * that budget while still looking like a human hand on the keyboard.
 *
 * Alignment marks (optional — fall back to hardcoded waits when absent):
 *   SIGNUP → name field focus
 *   TYPE_NAME → name typed; move to email
 *   TYPE_PASSWORD → email+password typed; move to confirm
 *   SUBMIT → confirm typed; click Continue
 *   CTA → post-redirect settle on home
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

type BoxCenter = { x: number; y: number };

async function centerOf(page: Page, selector: string): Promise<BoxCenter> {
  const handle = page.locator(selector);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`[signupDriver] locator not visible: ${selector}`);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

export async function drive({
  page,
  cursor,
  waitForMark,
  hasAlignment,
}: DriverArgs): Promise<void> {
  // Locate every field up front so later cursor moves measure against the
  // same layout even if the dev server were to rebuild mid-drive.
  const nameC = await centerOf(page, "#name");
  const emailC = await centerOf(page, "#email");
  const passwordC = await centerOf(page, "#password");
  const confirmC = await centerOf(page, "#confirmPassword");
  const submitC = await centerOf(page, 'button[type="submit"]');

  // Park cursor to the right of the card so the SyntheticCursor overlay
  // enters from a natural neutral position, not dead-center.
  await cursor.move(page, 1500, 180, 10);
  await page.waitForTimeout(180);

  if (hasAlignment) await waitForMark("SIGNUP");

  // --- Name ---
  await cursor.click(page, nameC.x, nameC.y);
  await page.waitForTimeout(100);
  await page.keyboard.type("Ayush Yadav", { delay: 55 });

  if (hasAlignment) await waitForMark("TYPE_NAME");
  else await page.waitForTimeout(120);

  // --- Email ---
  await cursor.click(page, emailC.x, emailC.y);
  await page.waitForTimeout(90);
  await page.keyboard.type("yadava5@miamioh.edu", { delay: 35 });
  await page.waitForTimeout(110);

  // --- Password ---
  await cursor.click(page, passwordC.x, passwordC.y);
  await page.waitForTimeout(90);
  await page.keyboard.type("SuperSecret123!", { delay: 40 });

  if (hasAlignment) await waitForMark("TYPE_PASSWORD");
  else await page.waitForTimeout(120);

  // --- Confirm password ---
  await cursor.click(page, confirmC.x, confirmC.y);
  await page.waitForTimeout(90);
  await page.keyboard.type("SuperSecret123!", { delay: 40 });
  await page.waitForTimeout(180);

  if (hasAlignment) await waitForMark("SUBMIT");

  // --- Submit ---
  await cursor.click(page, submitC.x, submitC.y);

  // SignupForm waits 500 ms between `setButtonState('success')` and the
  // navigate() call. Give the redirect + HomePage mount + greeting stagger a
  // breather so the last frame lands on "Good afternoon, Ayush".
  await page.waitForTimeout(900);

  if (hasAlignment) await waitForMark("CTA");

  // Final settle on home — keep cursor still so the mouse-release ripple
  // animates cleanly in the overlay.
  await page.waitForTimeout(350);
}
