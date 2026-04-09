import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Duplex } from 'node:stream';

import type { WebSocketServer } from 'ws';

import { appLogger } from '../../logging/logger.js';

export interface WebSocketUpgradeHandler {
  path: string;
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

export function acceptWebSocketUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  wss.handleUpgrade(req, socket, head, (ws, request) => {
    wss.emit('connection', ws, request);
  });
}

function getUpgradePath(req: IncomingMessage): string | null {
  try {
    return new URL(req.url ?? '', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

function rejectUpgrade(socket: Duplex, statusCode: number, reason: string): void {
  if (socket.destroyed) {
    return;
  }

  socket.write(
    `HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
  );
  socket.destroy();
}

export function attachWebSocketUpgradeRouter(
  server: HttpServer,
  handlers: WebSocketUpgradeHandler[]
): void {
  server.on('upgrade', (req, socket, head) => {
    const pathname = getUpgradePath(req);
    const handler = pathname ? handlers.find((candidate) => candidate.path === pathname) : undefined;

    if (!handler) {
      appLogger.warn(`[ws] Rejected upgrade for unknown path: ${pathname ?? req.url ?? '<empty>'}`);
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }

    handler.handleUpgrade(req, socket, head);
  });
}
