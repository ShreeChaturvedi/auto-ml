import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'automl-e2e-'));
const storagePath = path.join(tempRoot, 'projects.json');
const datasetMetadataPath = path.join(tempRoot, 'datasets', 'metadata.json');
const datasetFilesPath = path.join(tempRoot, 'datasets', 'files');
const benchmarkAuthBypass = process.env.BENCHMARK_AUTH_BYPASS === 'true';

// Port knobs — defaults chosen to not collide with the live `npm run dev`
// stack (backend:4000, frontend:5173). Override with BENCHMARK_PORT and
// BENCHMARK_PREVIEW_PORT when running benchmarks alongside the dev server.
const benchmarkPort = Number(process.env.BENCHMARK_PORT ?? 4100);
const previewPort = Number(process.env.BENCHMARK_PREVIEW_PORT ?? 4174);
const benchmarkOrigin = `http://127.0.0.1:${benchmarkPort}`;
const benchmarkApiBase = `${benchmarkOrigin}/api`;

process.env.AUTOML_STORAGE_PATH = storagePath;
process.env.AUTOML_DATASET_METADATA_PATH = datasetMetadataPath;
process.env.AUTOML_DATASET_FILES_PATH = datasetFilesPath;
// Keep all Playwright helpers/specs on the dedicated benchmark backend
// instead of silently falling back to the live dev API on :4000.
process.env.AUTOML_API_BASE_URL = benchmarkOrigin;
// Expose the benchmark api base to the spec via env so hard-coded
// http://localhost:4000 lookups can migrate to the configurable port.
process.env.BENCHMARK_API_BASE = benchmarkApiBase;

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  globalSetup: './playwright.global-setup.ts',
  webServer: [
    {
      command: 'npm --prefix ../backend run serve:benchmark',
      port: benchmarkPort,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(benchmarkPort),
        STORAGE_PATH: storagePath,
        DATASET_METADATA_PATH: datasetMetadataPath,
        DATASET_STORAGE_DIR: datasetFilesPath,
        ALLOWED_ORIGINS: `http://127.0.0.1:${previewPort},http://localhost:${previewPort}`,
        NODE_ENV: 'test',
        DEV_BYPASS_EMAIL_VERIFICATION: 'true',
        VITEST: 'true',
        ...(benchmarkAuthBypass ? { BENCHMARK_AUTH_BYPASS: 'true' } : {}),
        ...(process.env.LLM_PROVIDER ? { LLM_PROVIDER: process.env.LLM_PROVIDER } : {})
      }
    },
    {
      command: `npm --prefix ../frontend run preview -- --host --port ${previewPort}`,
      port: previewPort,
      reuseExistingServer: false,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
