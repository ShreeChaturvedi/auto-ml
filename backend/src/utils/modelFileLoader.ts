import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { env } from '../config.js';

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function resolveLegacyModelFilePath(filePath: string): string | null {
  const relativePath = relative(env.modelStorageDir, filePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null;
  }

  const rawModelStorageDir = process.env.MODEL_STORAGE_DIR ?? 'storage/models/artifacts';
  if (isAbsolute(rawModelStorageDir)) {
    return null;
  }

  const legacyBaseDir = resolve(process.cwd(), rawModelStorageDir);
  if (legacyBaseDir === env.modelStorageDir) {
    return null;
  }

  const legacyPath = resolve(legacyBaseDir, relativePath);
  return legacyPath === filePath ? null : legacyPath;
}

async function backfillRecoveredModelFile(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  } catch {
    // Best-effort backfill; callers still receive the recovered JSON payload.
  }
}

export async function loadModelFile(filePath: string): Promise<unknown> {
  try {
    return await readJsonFile(filePath);
  } catch {
    const legacyPath = resolveLegacyModelFilePath(filePath);
    if (!legacyPath) {
      return null;
    }

    try {
      const data = await readJsonFile(legacyPath);
      await backfillRecoveredModelFile(legacyPath, filePath);
      return data;
    } catch {
      return null;
    }
  }
}
