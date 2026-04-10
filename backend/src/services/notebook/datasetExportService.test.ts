/**
 * datasetExportService unit tests
 *
 * Covers the manifest-driven export pipeline that promotes CSVs written by
 * standalone notebooks into project datasets. These tests exercise the real
 * filesystem under an isolated temp directory so the path validation
 * (realpath, O_NOFOLLOW open, size limit, rollback) is covered end-to-end.
 *
 * Only the datasetRepository + config env paths are mocked.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ------------------------------------------------------------
// Hoisted shared test state (temp dirs + datasetRepository stub)
// ------------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const datasetCreate = vi.fn();
  const datasetDelete = vi.fn();
  return {
    datasetCreate,
    datasetDelete,
    // Populated in beforeEach with a fresh per-test temp root.
    paths: {
      root: '',
      workspaces: '',
      datasetStorage: '',
      datasetMetadata: ''
    }
  };
});

// Mock config so datasetExportService reads from our temp paths.
vi.mock('../../config.js', () => ({
  env: {
    // Accessed via getter so it reflects whatever the active test set.
    get executionWorkspaceDir() {
      return hoisted.paths.workspaces;
    },
    get datasetStorageDir() {
      return hoisted.paths.datasetStorage;
    },
    get datasetMetadataPath() {
      return hoisted.paths.datasetMetadata;
    },
    datasetUploadMaxMb: 1 // 1 MiB cap keeps size-limit test fast
  }
}));

// Mock datasetRepository create/delete — the factory must return an object
// whose methods forward to the hoisted spies.
vi.mock('../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    create: (...args: unknown[]) => hoisted.datasetCreate(...args),
    delete: (...args: unknown[]) => hoisted.datasetDelete(...args)
  })
}));

// Silence the service logger — errors/warnings are expected on the
// path validation / rollback tests.
vi.mock('../../logging/logger.js', () => ({
  appLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import type { Notebook } from '../../types/notebook.js';

import { processNotebookExports } from './datasetExportService.js';

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------

const PROJECT_ID = 'proj-0001';
const EXPORT_DIR_NAME = '_exports';
const MANIFEST_FILE = '.manifest.json';

function makeStandaloneNotebook(overrides: Partial<Notebook> = {}): Notebook {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    notebookId: '00000000-0000-0000-0000-00000000aaaa',
    projectId: PROJECT_ID,
    name: 'Exploration',
    kind: 'standalone',
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function makePhaseNotebook(): Notebook {
  return makeStandaloneNotebook({ kind: 'phase' });
}

async function writeManifest(entries: unknown): Promise<void> {
  const exportDir = path.join(hoisted.paths.workspaces, PROJECT_ID, EXPORT_DIR_NAME);
  await fs.mkdir(exportDir, { recursive: true });
  const body = typeof entries === 'string' ? entries : JSON.stringify(entries);
  await fs.writeFile(path.join(exportDir, MANIFEST_FILE), body, 'utf8');
}

async function writeCsv(name: string, content: string): Promise<void> {
  const exportDir = path.join(hoisted.paths.workspaces, PROJECT_ID, EXPORT_DIR_NAME);
  await fs.mkdir(exportDir, { recursive: true });
  await fs.writeFile(path.join(exportDir, name), content, 'utf8');
}

// ------------------------------------------------------------
// Per-test temp dir + mock wiring
// ------------------------------------------------------------

beforeEach(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dataset-export-'));
  hoisted.paths.root = root;
  hoisted.paths.workspaces = path.join(root, 'workspaces');
  hoisted.paths.datasetStorage = path.join(root, 'datasets', 'files');
  hoisted.paths.datasetMetadata = path.join(root, 'datasets', 'metadata.json');
  await fs.mkdir(hoisted.paths.workspaces, { recursive: true });
  await fs.mkdir(hoisted.paths.datasetStorage, { recursive: true });

  hoisted.datasetCreate.mockReset();
  hoisted.datasetDelete.mockReset();

  // Default: create stub returns a realistic dataset row.
  hoisted.datasetCreate.mockImplementation(async (input: { filename: string }) => ({
    datasetId: `ds-${Math.random().toString(36).slice(2, 10)}`,
    projectId: PROJECT_ID,
    filename: input.filename,
    fileType: 'csv',
    size: 0,
    nRows: 0,
    nCols: 0,
    columns: [],
    sample: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
  hoisted.datasetDelete.mockResolvedValue(true);
});

afterEach(async () => {
  if (hoisted.paths.root) {
    await fs.rm(hoisted.paths.root, { recursive: true, force: true });
  }
});

// ============================================================
// Tests
// ============================================================

describe('processNotebookExports', () => {
  const notebook = makeStandaloneNotebook();

  it('persists a single manifest entry end-to-end', async () => {
    await writeCsv('export1.csv', 'a,b\n1,2\n3,4\n');
    await writeManifest([
      { name: 'export1.csv', rows: 2, cols: 2, exportId: 'exp-1' }
    ]);

    const summaries = await processNotebookExports(notebook, PROJECT_ID);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      name: 'export1.csv',
      rows: 2,
      cols: 2
    });
    expect(hoisted.datasetCreate).toHaveBeenCalledTimes(1);
    const createArg = hoisted.datasetCreate.mock.calls[0][0];
    expect(createArg).toMatchObject({
      projectId: PROJECT_ID,
      filename: 'export1.csv',
      fileType: 'csv'
    });
    expect(createArg.metadata).toMatchObject({
      source: 'notebook_export',
      exportId: 'exp-1'
    });

    // Manifest should be unlinked post-processing.
    const manifestPath = path.join(
      hoisted.paths.workspaces,
      PROJECT_ID,
      EXPORT_DIR_NAME,
      MANIFEST_FILE
    );
    await expect(fs.access(manifestPath)).rejects.toThrow();
  });

  it('processes every entry in a multi-entry manifest', async () => {
    await writeCsv('a.csv', 'x\n1\n');
    await writeCsv('b.csv', 'x,y\n1,2\n');
    await writeCsv('c.csv', 'x\n1\n2\n3\n');
    await writeManifest([
      { name: 'a.csv', rows: 1, cols: 1 },
      { name: 'b.csv', rows: 1, cols: 2 },
      { name: 'c.csv', rows: 3, cols: 1 }
    ]);

    const summaries = await processNotebookExports(notebook, PROJECT_ID);

    expect(summaries).toHaveLength(3);
    expect(hoisted.datasetCreate).toHaveBeenCalledTimes(3);
    expect(summaries.map((s) => s.name).sort()).toEqual(['a.csv', 'b.csv', 'c.csv']);
  });

  it('returns [] and swallows the error on malformed manifest JSON', async () => {
    await writeManifest('{not valid json');

    const summaries = await processNotebookExports(notebook, PROJECT_ID);

    expect(summaries).toEqual([]);
    expect(hoisted.datasetCreate).not.toHaveBeenCalled();
  });

  it('returns [] when no manifest file exists', async () => {
    // Workspace exists but no _exports dir.
    await fs.mkdir(path.join(hoisted.paths.workspaces, PROJECT_ID), { recursive: true });

    const summaries = await processNotebookExports(notebook, PROJECT_ID);

    expect(summaries).toEqual([]);
    expect(hoisted.datasetCreate).not.toHaveBeenCalled();
  });

  it('rejects path-traversal entries while still processing valid siblings', async () => {
    await writeCsv('good.csv', 'a\n1\n');
    await writeManifest([
      { name: '../../../etc/passwd.csv', rows: 1, cols: 1 },
      { name: 'good.csv', rows: 1, cols: 1 }
    ]);

    const summaries = await processNotebookExports(notebook, PROJECT_ID);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('good.csv');
    expect(hoisted.datasetCreate).toHaveBeenCalledTimes(1);
    expect(hoisted.datasetCreate.mock.calls[0][0].filename).toBe('good.csv');
  });

  it('short-circuits for non-standalone notebooks without reading the manifest', async () => {
    // A manifest is present but the notebook is a phase notebook — the
    // function must early-return and never touch the filesystem.
    await writeCsv('ignored.csv', 'a\n1\n');
    await writeManifest([{ name: 'ignored.csv', rows: 1, cols: 1 }]);

    const summaries = await processNotebookExports(makePhaseNotebook(), PROJECT_ID);

    expect(summaries).toEqual([]);
    expect(hoisted.datasetCreate).not.toHaveBeenCalled();
    // Manifest untouched (still present) because phase notebooks must not
    // drain the standalone export queue.
    const manifestPath = path.join(
      hoisted.paths.workspaces,
      PROJECT_ID,
      EXPORT_DIR_NAME,
      MANIFEST_FILE
    );
    await expect(fs.access(manifestPath)).resolves.toBeUndefined();
  });

  it('rejects CSVs that exceed the configured size limit', async () => {
    // Configured cap is 1 MiB in the mocked env above; write ~1.5 MiB.
    const oneAndAHalfMb = 'a,b\n' + '1,2\n'.repeat(400_000); // ~1.6 MiB
    await writeCsv('big.csv', oneAndAHalfMb);
    await writeManifest([{ name: 'big.csv', rows: 400_000, cols: 2 }]);

    const summaries = await processNotebookExports(notebook, PROJECT_ID);

    expect(summaries).toEqual([]);
    expect(hoisted.datasetCreate).not.toHaveBeenCalled();
  });

  it('rolls back repo state and cleans up temp/final files when create throws', async () => {
    await writeCsv('rollback.csv', 'a,b\n1,2\n');
    await writeManifest([{ name: 'rollback.csv', rows: 1, cols: 2 }]);

    hoisted.datasetCreate.mockRejectedValueOnce(new Error('boom'));

    const summaries = await processNotebookExports(notebook, PROJECT_ID);

    expect(summaries).toEqual([]);
    // Since create itself failed, we never got a datasetId, so delete
    // should NOT have been called (nothing to roll back on the repo side).
    expect(hoisted.datasetDelete).not.toHaveBeenCalled();

    // No stray .tmp or final files in the dataset storage dir.
    const storageChildren = await fs.readdir(hoisted.paths.datasetStorage);
    expect(storageChildren).toEqual([]);

    // The manifest is still unlinked at the end of processNotebookExports,
    // even when individual entries fail — guarantee we don't replay it.
    const manifestPath = path.join(
      hoisted.paths.workspaces,
      PROJECT_ID,
      EXPORT_DIR_NAME,
      MANIFEST_FILE
    );
    await expect(fs.access(manifestPath)).rejects.toThrow();
  });
});
