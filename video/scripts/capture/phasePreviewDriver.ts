import type { Page } from "playwright";

import {
  LANDING_PREVIEW_CAPTURE_POSTROLL_MS,
  LANDING_PREVIEW_CAPTURE_TIMEOUT_MS,
  startLandingPreviewCapture,
  waitForLandingPreviewFinished,
} from "./landingPreviewRuntime";
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
  finishTimeoutMs?: number;
  postrollMs?: number;
};

export async function drive({
  page,
  finishTimeoutMs = LANDING_PREVIEW_CAPTURE_TIMEOUT_MS,
  postrollMs = LANDING_PREVIEW_CAPTURE_POSTROLL_MS,
}: DriverArgs): Promise<DriverResult> {
  await startLandingPreviewCapture(page);
  await waitForLandingPreviewFinished(page, finishTimeoutMs);
  await page.waitForTimeout(postrollMs);
  return {};
}
