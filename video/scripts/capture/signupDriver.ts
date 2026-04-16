/**
 * Signup-beat driver. Types credentials into the real SignupForm at
 * `http://localhost:5173/signup`, clicks Continue, and — once the mocked
 * `/api/auth/register` returns a user with `email_verified: false` — the
 * frontend redirects to `/verify-email/pending`.
 *
 * From there, this driver opens a second tab and drives the end-to-end
 * "open Gmail, click verify link" flow against a painterly new-tab page
 * and a Gmail-lookalike that hosts the verification email. Clicking the
 * CTA navigates the second tab to the REAL `VerifyEmailPage`, which POSTs
 * to the mocked `/api/auth/verify-email`, sees success, and navigates to
 * `/`. The orchestrator persists both tabs' webms + cursor JSONs.
 *
 * Alignment marks (optional — fall back to hardcoded waits when absent):
 *   SIGNUP → name field focus
 *   TYPE_NAME → name typed; move to email
 *   TYPE_PASSWORD → email+password typed; move to confirm
 *   SUBMIT → confirm typed; click Continue
 *   CTA → post-redirect settle on home
 */
import type { Page } from "playwright";
import { centerOf } from "./helpers";
import type {
  CursorRecorder,
  DriverResult,
  MarkPacer,
  RafScroll,
} from "./types";

export type DriverArgs = {
  page: Page;
  cursor: CursorRecorder;
  rafScroll: RafScroll;
  waitForMark: MarkPacer["waitForMark"];
  hasAlignment: boolean;
  /**
   * Creates a fresh cursor recorder for an additional page (second tab).
   * Orchestrator provides this so per-page entries stay isolated.
   */
  makeCursor: () => CursorRecorder;
  /**
   * Returns wall-ms elapsed since context creation. Used to capture the
   * `openedAtMs` metadata for secondary tabs.
   */
  contextMs: () => number;
};

export async function drive({
  page,
  cursor,
  waitForMark,
  hasAlignment,
  makeCursor,
  contextMs,
}: DriverArgs): Promise<DriverResult> {
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
  // Typing delays are tuned ~4% slower than ordinary "human hand" pacing so
  // the form fill reads as deliberate on playback rather than mechanical.
  await cursor.click(page, nameC.x, nameC.y);
  await page.waitForTimeout(105);
  await page.keyboard.type("Ayush Yadav", { delay: 58 });

  if (hasAlignment) await waitForMark("TYPE_NAME");
  else await page.waitForTimeout(125);

  // --- Email ---
  await cursor.click(page, emailC.x, emailC.y);
  await page.waitForTimeout(95);
  await page.keyboard.type("yadava5@miamioh.edu", { delay: 37 });
  await page.waitForTimeout(115);

  // --- Password ---
  await cursor.click(page, passwordC.x, passwordC.y);
  await page.waitForTimeout(95);
  await page.keyboard.type("SuperSecret123!", { delay: 42 });

  if (hasAlignment) await waitForMark("TYPE_PASSWORD");
  else await page.waitForTimeout(125);

  // --- Confirm password ---
  await cursor.click(page, confirmC.x, confirmC.y);
  await page.waitForTimeout(95);
  await page.keyboard.type("SuperSecret123!", { delay: 42 });
  // "About-to-submit" beat — a short breath before the click lets the viewer
  // register that the form is complete. 750 ms > typical keystroke gap ⇒
  // reads as intentional rather than stall.
  await page.waitForTimeout(750);

  if (hasAlignment) await waitForMark("SUBMIT");

  // --- Submit ---
  await cursor.click(page, submitC.x, submitC.y);

  // SignupForm waits 500 ms after `setButtonState('success')` before
  // navigating. Register returns `email_verified: false` so the redirect
  // lands on `/verify-email/pending` rather than `/`.
  await page.waitForURL("**/verify-email/pending", { timeout: 5_000 }).catch(() => {
    /* Fallback: if the pending redirect doesn't fire, continue anyway —
       the multi-tab flow below is independent. */
  });
  // Pause so the pending page's entry animations finish before we jump
  // tabs — gives the viewer a moment to see the "check your email" copy.
  await page.waitForTimeout(1200);

  // --- Second tab: Gmail-lookalike verification flow ----------------------
  const extraPage = await drivePostSignupVerify({ page, makeCursor, contextMs });

  if (hasAlignment) await waitForMark("CTA");

  return { extraPages: [extraPage] };
}

// -----------------------------------------------------------------------------
// Secondary-tab flow: open painterly new-tab → search "gmail.com" → click the
// unread email → click the verify CTA → watch real VerifyEmailPage redirect
// -----------------------------------------------------------------------------

type VerifyArgs = {
  page: Page;
  makeCursor: () => CursorRecorder;
  contextMs: () => number;
};

async function drivePostSignupVerify({
  page,
  makeCursor,
  contextMs,
}: VerifyArgs): Promise<{
  page: Page;
  entries: ReturnType<CursorRecorder["entries"]>;
  openedAtMs: number;
  labelSuffix: string;
  url: string;
}> {
  const gmailPage = await page.context().newPage();
  const openedAtMs = Math.round(contextMs());
  const gmailCursor = makeCursor();

  await gmailPage.goto("http://localhost:4321/newtab?shortcuts=1", {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await gmailPage.evaluate(() => document.fonts.ready);
  // Let the painterly backdrop + color blobs settle for one frame before
  // the cursor moves in — prevents a visible "jump" on first paint.
  await gmailPage.waitForTimeout(600);

  // Cursor drifts to the search bar from top-right (neutral entry).
  await gmailCursor.move(gmailPage, 1600, 180, 10);
  await gmailPage.waitForTimeout(200);

  const searchC = await centerOf(gmailPage, "#newtab-search-input");
  await gmailCursor.move(gmailPage, searchC.x, searchC.y, 30);
  await gmailPage.waitForTimeout(260);
  await gmailCursor.click(gmailPage, searchC.x, searchC.y);
  await gmailPage.waitForTimeout(120);
  // "gmail.com" is 9 chars — 65 ms/char ≈ 585 ms typing time.
  await gmailPage.keyboard.type("gmail.com", { delay: 65 });
  await gmailPage.waitForTimeout(400);
  await gmailPage.keyboard.press("Enter");

  await gmailPage.waitForURL("**/mock-gmail", { timeout: 10_000 });
  await gmailPage.evaluate(() => document.fonts.ready);
  await gmailPage.waitForTimeout(900);

  // --- Inbox: click the unread verification email -------------------------
  const unreadRow = await centerOf(gmailPage, "a.gm-thread");
  await gmailCursor.move(gmailPage, unreadRow.x, unreadRow.y, 30);
  await gmailPage.waitForTimeout(350);
  await gmailCursor.click(gmailPage, unreadRow.x, unreadRow.y);

  await gmailPage.waitForURL("**/mock-gmail/email", { timeout: 10_000 });
  await gmailPage.evaluate(() => document.fonts.ready);
  await gmailPage.waitForTimeout(1100);

  // --- Email detail: click the verify CTA ---------------------------------
  const verifyCta = await centerOf(gmailPage, "a.vmail-cta");
  // Pre-hover drift so the viewer's eye follows the cursor to the button.
  await gmailCursor.move(gmailPage, verifyCta.x - 80, verifyCta.y + 40, 25);
  await gmailPage.waitForTimeout(250);
  await gmailCursor.move(gmailPage, verifyCta.x, verifyCta.y, 20);
  await gmailPage.waitForTimeout(350);
  await gmailCursor.click(gmailPage, verifyCta.x, verifyCta.y);

  // Real VerifyEmailPage mounts, POSTs /api/auth/verify-email, shows the
  // success state, then a 2s internal timer navigates to `/`.
  await gmailPage.waitForURL("**/verify-email**", { timeout: 10_000 });
  // 2s for VerifyEmailPage's internal navigate timer + buffer for the
  // HomePage staggered entry animations.
  await gmailPage.waitForTimeout(2300);
  await gmailPage
    .waitForURL("http://localhost:5173/", { timeout: 5_000 })
    .catch(() => {
      /* fall through — if the timer missed, at least we have the success
         frame in the webm. */
    });
  // HomePage stagger (100/200/300/400/500 ms) — hold for the last-staggered
  // panel to land before we stop the capture.
  await gmailPage.waitForTimeout(700);

  return {
    page: gmailPage,
    entries: gmailCursor.entries(),
    openedAtMs,
    labelSuffix: "gmail",
    url: "mail.google.com",
  };
}
