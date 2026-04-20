import type { Page } from "playwright";

export type LandingPreviewPhasePreset =
  | "ingest"
  | "explore"
  | "preprocess"
  | "engineer"
  | "train"
  | "experiments"
  | "deploy";

export type LandingPreviewHeroPreset =
  | "hero-upload"
  | "hero-explore"
  | "hero-preprocess"
  | "hero-train"
  | "hero-deploy";

export type LandingPreviewPreset =
  | LandingPreviewPhasePreset
  | LandingPreviewHeroPreset;

export type LandingPreviewCaptureStatus =
  | "booting"
  | "ready"
  | "running"
  | "finished"
  | "cancelled";

export const LANDING_PREVIEW_PHASE_PRESETS = [
  "ingest",
  "explore",
  "preprocess",
  "engineer",
  "train",
  "experiments",
  "deploy",
] as const satisfies readonly LandingPreviewPhasePreset[];

export const LANDING_PREVIEW_HERO_PRESETS = [
  "hero-upload",
  "hero-explore",
  "hero-preprocess",
  "hero-train",
  "hero-deploy",
] as const satisfies readonly LandingPreviewHeroPreset[];

export const LANDING_PREVIEW_CAPTURE_PATH = "/dev/landing-preview";
export const LANDING_PREVIEW_CAPTURE_VIEWPORT = {
  width: 1600,
  height: 1000,
} as const;
export const LANDING_PREVIEW_CAPTURE_PREROLL_MS = 300;
export const LANDING_PREVIEW_CAPTURE_POSTROLL_MS = 1800;
export const LANDING_PREVIEW_CAPTURE_TIMEOUT_MS = 15_000;

type LandingPreviewCaptureRuntime = {
  status?: LandingPreviewCaptureStatus;
  start?: () => Promise<void> | void;
};

export function buildLandingPreviewCaptureUrl(
  frontendUrl: string,
  preset: LandingPreviewPreset,
): string {
  const url = new URL(LANDING_PREVIEW_CAPTURE_PATH, frontendUrl);
  url.searchParams.set("preset", preset);
  return url.toString();
}

export async function waitForLandingPreviewCaptureStatus(
  page: Page,
  status: LandingPreviewCaptureStatus,
  timeoutMs = LANDING_PREVIEW_CAPTURE_TIMEOUT_MS,
): Promise<void> {
  await page.waitForFunction(
    (expectedStatus) =>
      (
        window as Window & {
          __landingPreviewCapture?: LandingPreviewCaptureRuntime;
        }
      ).__landingPreviewCapture?.status === expectedStatus,
    status,
    { timeout: timeoutMs },
  );
}

export async function waitForLandingPreviewReady(
  page: Page,
  timeoutMs = LANDING_PREVIEW_CAPTURE_TIMEOUT_MS,
): Promise<void> {
  await waitForLandingPreviewCaptureStatus(page, "ready", timeoutMs);
}

export async function waitForLandingPreviewFinished(
  page: Page,
  timeoutMs = LANDING_PREVIEW_CAPTURE_TIMEOUT_MS,
): Promise<void> {
  await waitForLandingPreviewCaptureStatus(page, "finished", timeoutMs);
}

export async function startLandingPreviewCapture(page: Page): Promise<void> {
  const started = await page.evaluate(() => {
    const runtime = (
      window as Window & {
        __landingPreviewCapture?: LandingPreviewCaptureRuntime;
      }
    ).__landingPreviewCapture;
    if (!runtime?.start) return false;
    void runtime.start();
    return true;
  });
  if (!started) {
    throw new Error("[capture] landing preview runtime is missing `start()`");
  }
}
