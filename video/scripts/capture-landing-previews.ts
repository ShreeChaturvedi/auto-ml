import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { chromium } from 'playwright';

import {
  buildLandingPreviewCaptureUrl,
  LANDING_PREVIEW_CAPTURE_POSTROLL_MS,
  LANDING_PREVIEW_CAPTURE_PREROLL_MS,
  LANDING_PREVIEW_CAPTURE_VIEWPORT,
  LANDING_PREVIEW_HERO_PRESETS,
  LANDING_PREVIEW_PHASE_PRESETS,
  type LandingPreviewHeroPreset,
  type LandingPreviewPhasePreset,
  type LandingPreviewPreset,
  startLandingPreviewCapture,
  waitForLandingPreviewFinished,
  waitForLandingPreviewReady,
} from './capture/landingPreviewRuntime';
import { ScreencastRecorder } from './capture/screencastRecorder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(VIDEO_ROOT, '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'frontend');
const RAW_CAPTURE_DIR = path.join(VIDEO_ROOT, 'public', 'captures', 'landing-previews', 'raw');
const LANDING_PREVIEW_DIR = path.join(REPO_ROOT, 'landing', 'public', 'previews');
const PREVIEW_VERSION_FILE = path.join(
  REPO_ROOT,
  'landing',
  'src',
  'components',
  'previews',
  'generatedPreviewVersion.ts',
);

type CaptureEndpoint = {
  baseUrl: string;
  port: number;
};

function resolveCaptureEndpoint({
  label,
  fallbackUrl,
  fallbackPort,
  urlEnvName,
  portEnvName,
}: {
  label: string;
  fallbackUrl: string;
  fallbackPort: number;
  urlEnvName: string;
  portEnvName: string;
}): CaptureEndpoint {
  const envUrl = process.env[urlEnvName]?.trim();
  const envPort = process.env[portEnvName]?.trim();
  const url = new URL(envUrl || fallbackUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`[landing-previews] ${urlEnvName} must use http:// or https:// for ${label}.`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`[landing-previews] ${urlEnvName} must be an origin-only URL for ${label}.`);
  }

  let port = url.port ? Number.parseInt(url.port, 10) : fallbackPort;
  if (envPort) {
    port = Number.parseInt(envPort, 10);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`[landing-previews] ${portEnvName} must be a valid TCP port for ${label}.`);
  }

  url.port = String(port);
  return {
    baseUrl: url.toString().replace(/\/$/, ''),
    port,
  };
}

const FRONTEND_SERVER = resolveCaptureEndpoint({
  label: 'frontend',
  fallbackUrl: 'http://127.0.0.1:5173',
  fallbackPort: 5173,
  urlEnvName: 'CAPTURE_FRONTEND_URL',
  portEnvName: 'CAPTURE_FRONTEND_PORT',
});
const FRONTEND_URL = FRONTEND_SERVER.baseUrl;
const CAPTURE_VIEWPORT = { ...LANDING_PREVIEW_CAPTURE_VIEWPORT };
const PHASE_OUTPUT_SIZE = { width: 1150, height: 500 };
const PHASE_CROP = { x: 184, y: 34, width: 1320, height: 572 };
const PREROLL_MS = LANDING_PREVIEW_CAPTURE_PREROLL_MS;
const POSTROLL_MS = LANDING_PREVIEW_CAPTURE_POSTROLL_MS;

const cleanupFns: Array<() => void | Promise<void>> = [];
let signalHandled = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    if (signalHandled) return;
    signalHandled = true;
    const forceExit = setTimeout(() => process.exit(130), 5_000);
    forceExit.unref();
    void (async () => {
      await Promise.allSettled(cleanupFns.map((fn) => Promise.resolve().then(fn)));
      clearTimeout(forceExit);
      process.exit(130);
    })();
  });
}

type PhasePreviewId = LandingPreviewPhasePreset;
type HeroPresetId = LandingPreviewHeroPreset;
type CapturePresetId = LandingPreviewPreset;

const PHASE_PRESETS: readonly PhasePreviewId[] = LANDING_PREVIEW_PHASE_PRESETS;
const HERO_PRESETS: readonly HeroPresetId[] = LANDING_PREVIEW_HERO_PRESETS;

const HERO_SEGMENTS: ReadonlyArray<{
  preset: HeroPresetId;
  start: number;
  end: number;
}> = [
  { preset: 'hero-upload', start: 0.3, end: 1.55 },
  { preset: 'hero-explore', start: 0.2, end: 1.25 },
  { preset: 'hero-preprocess', start: 0.2, end: 1.45 },
  { preset: 'hero-train', start: 0.2, end: 1.55 },
  { preset: 'hero-deploy', start: 0.2, end: 1.55 },
  { preset: 'hero-upload', start: 0.9, end: 1.55 },
];

async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok || res.status === 404) {
        return true;
      }
    } catch {
      // Server is still starting.
    }
    await sleep(250);
  }
  return false;
}

async function ensureFrontendServer(): Promise<ChildProcess | null> {
  if (await waitForHttp(FRONTEND_URL, 1000)) {
    console.log(`[landing-previews] reusing frontend server at ${FRONTEND_URL}`);
    return null;
  }

  console.log('[landing-previews] starting frontend dev server...');
  const proc = spawn('npm', ['run', 'dev:ui', '--', '--host', '0.0.0.0', '--port', String(FRONTEND_SERVER.port)], {
    cwd: FRONTEND_ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: 'inherit',
  });

  const up = await waitForHttp(FRONTEND_URL, 60_000);
  if (!up) {
    proc.kill('SIGTERM');
    throw new Error('Frontend dev server did not become ready within 60 seconds.');
  }

  return proc;
}

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', args, { stdio: 'pipe' });
}

function ffprobeSeconds(filePath: string): number {
  const output = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      filePath,
    ],
    { encoding: 'utf-8', stdio: 'pipe' },
  );
  return Number.parseFloat(output.trim());
}

async function writePreviewVersionFile(version: string) {
  const contents = [
    '// This file is auto-generated by `npm --prefix video run capture:landing-previews`.',
    '// Bump it whenever preview media is re-exported so browsers reload updated assets.',
    `export const previewAssetVersion = '${version}';`,
    '',
  ].join('\n');

  await writeFile(PREVIEW_VERSION_FILE, contents, 'utf8');
}

async function capturePreset(preset: CapturePresetId): Promise<string> {
  const outputPath = path.join(RAW_CAPTURE_DIR, `${preset}.mp4`);
  await rm(outputPath, { force: true });

  const browser = await chromium.launch({ headless: true });
  let recorder: ScreencastRecorder | null = null;
  const cleanup = async () => {
    if (recorder) await recorder.stop().catch(() => {});
    await browser.close().catch(() => {});
  };
  cleanupFns.push(cleanup);
  try {
    const page = await browser.newPage({
      viewport: CAPTURE_VIEWPORT,
      deviceScaleFactor: 1,
    });

    await page.goto(buildLandingPreviewCaptureUrl(FRONTEND_URL, preset), {
      waitUntil: 'domcontentloaded',
    });
    await waitForLandingPreviewReady(page);
    await page.waitForTimeout(PREROLL_MS);

    recorder = await ScreencastRecorder.start({
      page,
      outputPath,
      size: CAPTURE_VIEWPORT,
      jpegQuality: 96,
    });

    await startLandingPreviewCapture(page);
    await waitForLandingPreviewFinished(page);
    await page.waitForTimeout(POSTROLL_MS);
    await recorder.stop();
    recorder = null;

    return outputPath;
  } finally {
    const idx = cleanupFns.indexOf(cleanup);
    if (idx >= 0) cleanupFns.splice(idx, 1);
    await cleanup();
  }
}

function exportLoopAssets(inputPath: string, id: PhasePreviewId) {
  const outputMp4 = path.join(LANDING_PREVIEW_DIR, `${id}.mp4`);
  const outputWebm = path.join(LANDING_PREVIEW_DIR, `${id}.webm`);
  const outputPoster = path.join(LANDING_PREVIEW_DIR, `${id}.webp`);
  const duration = ffprobeSeconds(inputPath);
  const fadeStart = Math.max(duration - 0.18, 0);
  const filter = [
    `crop=${PHASE_CROP.width}:${PHASE_CROP.height}:${PHASE_CROP.x}:${PHASE_CROP.y}`,
    `scale=${PHASE_OUTPUT_SIZE.width}:${PHASE_OUTPUT_SIZE.height}`,
    'fps=25',
    'format=yuv420p',
    'fade=t=in:st=0:d=0.18',
    `fade=t=out:st=${fadeStart.toFixed(3)}:d=0.18`,
  ].join(',');

  ffmpeg([
    '-y',
    '-i',
    inputPath,
    '-vf',
    filter,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '16',
    outputMp4,
  ]);

  ffmpeg([
    '-y',
    '-i',
    outputMp4,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '28',
    '-b:v',
    '0',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    outputWebm,
  ]);

  ffmpeg([
    '-y',
    '-ss',
    (duration / 2).toFixed(3),
    '-i',
    outputMp4,
    '-frames:v',
    '1',
    '-q:v',
    '82',
    outputPoster,
  ]);
}

function exportHeroMontage(heroInputs: Record<HeroPresetId, string>) {
  const heroMaster = path.join(RAW_CAPTURE_DIR, 'hero-montage-master.mp4');
  const outputMp4 = path.join(LANDING_PREVIEW_DIR, 'hero-montage.mp4');
  const outputWebm = path.join(LANDING_PREVIEW_DIR, 'hero-montage.webm');
  const outputPoster = path.join(LANDING_PREVIEW_DIR, 'hero-montage.webp');

  const ffmpegInputs = HERO_PRESETS.flatMap((preset) => ['-i', heroInputs[preset]]);
  const filterParts = HERO_SEGMENTS.map((segment, index) => {
    const inputIndex = HERO_PRESETS.indexOf(segment.preset);
    return `[${inputIndex}:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`;
  });
  const concatInputs = HERO_SEGMENTS.map((_, index) => `[v${index}]`).join('');
  const filterComplex = `${filterParts.join(';')};${concatInputs}concat=n=${HERO_SEGMENTS.length}:v=1:a=0[vout]`;

  ffmpeg([
    '-y',
    ...ffmpegInputs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[vout]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '16',
    heroMaster,
  ]);

  ffmpeg([
    '-y',
    '-i',
    heroMaster,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '16',
    outputMp4,
  ]);

  ffmpeg([
    '-y',
    '-i',
    outputMp4,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '28',
    '-b:v',
    '0',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    outputWebm,
  ]);

  const duration = ffprobeSeconds(outputMp4);
  ffmpeg([
    '-y',
    '-ss',
    Math.min(duration / 2, 2.1).toFixed(3),
    '-i',
    outputMp4,
    '-frames:v',
    '1',
    '-q:v',
    '82',
    outputPoster,
  ]);
}

async function main() {
  await mkdir(RAW_CAPTURE_DIR, { recursive: true });
  await mkdir(LANDING_PREVIEW_DIR, { recursive: true });

  const frontendProc = await ensureFrontendServer();
  const frontendCleanup = () => {
    if (frontendProc && !frontendProc.killed) {
      frontendProc.kill('SIGTERM');
    }
  };
  cleanupFns.push(frontendCleanup);
  try {
    const previewAssetVersion = new Date().toISOString().replace(/[-:.]/g, '');
    const heroInputs = {} as Record<HeroPresetId, string>;

    for (const preset of HERO_PRESETS) {
      console.log(`[landing-previews] capturing ${preset}...`);
      heroInputs[preset] = await capturePreset(preset);
    }

    for (const preset of PHASE_PRESETS) {
      console.log(`[landing-previews] capturing ${preset}...`);
      const inputPath = await capturePreset(preset);
      console.log(`[landing-previews] exporting ${preset} assets...`);
      exportLoopAssets(inputPath, preset);
    }

    console.log('[landing-previews] exporting hero montage...');
    exportHeroMontage(heroInputs);
    await writePreviewVersionFile(previewAssetVersion);
    console.log(`[landing-previews] preview asset version: ${previewAssetVersion}`);
  } finally {
    const idx = cleanupFns.indexOf(frontendCleanup);
    if (idx >= 0) cleanupFns.splice(idx, 1);
    frontendCleanup();
  }
}

main().catch((error) => {
  if (signalHandled) return;
  console.error('[landing-previews] failed:', error);
  process.exit(1);
});
