import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureDirectory, ensureDirectoryForFile } from '../fs.js';

function tmpPath(...segments: string[]): string {
  return join(tmpdir(), `fs-test-${randomUUID()}`, ...segments);
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
  roots.length = 0;
});

describe('ensureDirectoryForFile', () => {
  it('creates the parent directory for a file path', () => {
    const filePath = tmpPath('data', 'file.json');
    const root = join(tmpdir(), filePath.split('/').at(-3)!);
    roots.push(root);

    ensureDirectoryForFile(filePath);

    expect(existsSync(join(filePath, '..'))).toBe(true);
  });

  it('is idempotent on repeat calls', () => {
    const filePath = tmpPath('data', 'file.json');
    const root = join(tmpdir(), filePath.split('/').at(-3)!);
    roots.push(root);

    ensureDirectoryForFile(filePath);
    ensureDirectoryForFile(filePath);

    expect(existsSync(join(filePath, '..'))).toBe(true);
  });
});

describe('ensureDirectory', () => {
  it('creates the directory directly', () => {
    const dirPath = tmpPath('outputs');
    const root = join(dirPath, '..');
    roots.push(root);

    ensureDirectory(dirPath);

    expect(existsSync(dirPath)).toBe(true);
  });

  it('is idempotent on repeat calls', () => {
    const dirPath = tmpPath('outputs');
    const root = join(dirPath, '..');
    roots.push(root);

    ensureDirectory(dirPath);
    ensureDirectory(dirPath);

    expect(existsSync(dirPath)).toBe(true);
  });
});
