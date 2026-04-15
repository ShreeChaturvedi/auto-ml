#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { createDevRunner } from './devRunner.mjs';

const isDirectRun =
  process.argv[1] != null && fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], 'file:'));

if (isDirectRun) {
  const runner = createDevRunner();

  runner
    .run()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
