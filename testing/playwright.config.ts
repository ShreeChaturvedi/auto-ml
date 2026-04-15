import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'automl-e2e-'));
const storagePath = path.join(tempRoot, 'projects.json');
const datasetMetadataPath = path.join(tempRoot, 'datasets', 'metadata.json');
const datasetFilesPath = path.join(tempRoot, 'datasets', 'files');

process.env.AUTOML_STORAGE_PATH = storagePath;
process.env.AUTOML_DATASET_METADATA_PATH = datasetMetadataPath;
process.env.AUTOML_DATASET_FILES_PATH = datasetFilesPath;

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
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  globalSetup: './playwright.global-setup.ts',
  webServer: [
    {
      command: 'npm --prefix ../backend run serve:benchmark',
      port: 4000,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: '4000',
        STORAGE_PATH: storagePath,
        DATASET_METADATA_PATH: datasetMetadataPath,
      DATASET_STORAGE_DIR: datasetFilesPath,
      ALLOWED_ORIGINS: 'http://127.0.0.1:4173,http://localhost:4173',
      NODE_ENV: 'test',
      VITEST: 'true'
    }
  },
    {
      command: 'npm --prefix ../frontend run preview -- --host --port 4173',
      port: 4173,
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
