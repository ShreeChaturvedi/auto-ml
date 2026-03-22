import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function ensureDirectoryForFile(filePath: string): void {
  const directory = dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}
