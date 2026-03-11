import net from 'node:net';

import { describe } from 'vitest';

let bindCheckPromise: Promise<boolean> | null = null;

async function canListen(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.listen(0, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

const canBind = await (bindCheckPromise ??= canListen());

export const describeRouteSuite = canBind ? describe : describe.skip;
