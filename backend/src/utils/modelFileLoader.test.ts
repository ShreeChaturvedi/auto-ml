import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../config.js';

const hoisted = vi.hoisted(() => ({
  mockCopyFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  copyFile: hoisted.mockCopyFile,
  mkdir: hoisted.mockMkdir,
  readFile: hoisted.mockReadFile,
}));

import { loadModelFile } from './modelFileLoader.js';

const { mockCopyFile, mockMkdir, mockReadFile } = hoisted;

describe('loadModelFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recovers legacy cwd-relative model artifacts and backfills the resolved storage path', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(resolve(env.modelStorageDir, '..', '..', '..', '..'));

    const resolvedPath = join(env.modelStorageDir, 'model-1', 'evaluation.json');
    const legacyPath = resolve(
      process.cwd(),
      process.env.MODEL_STORAGE_DIR ?? 'storage/models/artifacts',
      'model-1',
      'evaluation.json',
    );

    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath === resolvedPath) {
        throw new Error('ENOENT: missing resolved artifact');
      }
      if (filePath === legacyPath) {
        return JSON.stringify({ taskType: 'classification', computeMs: 42 });
      }
      throw new Error(`Unexpected read path: ${filePath}`);
    });

    const data = await loadModelFile(resolvedPath);

    expect(data).toEqual({ taskType: 'classification', computeMs: 42 });
    expect(mockMkdir).toHaveBeenCalledWith(join(env.modelStorageDir, 'model-1'), { recursive: true });
    expect(mockCopyFile).toHaveBeenCalledWith(legacyPath, resolvedPath);
  });

  it('returns null when neither resolved nor legacy artifact exists', async () => {
    const resolvedPath = join(env.modelStorageDir, 'missing-model', 'evaluation.json');

    mockReadFile.mockRejectedValue(new Error('ENOENT: missing artifact'));

    const data = await loadModelFile(resolvedPath);

    expect(data).toBeNull();
    expect(mockCopyFile).not.toHaveBeenCalled();
  });
});
