import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function ensureDirectoryForFile(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function ensureDirectory(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}
