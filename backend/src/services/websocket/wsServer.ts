import type { IncomingMessage } from 'http';
import { randomUUID } from 'node:crypto';
import type { Duplex } from 'node:stream';

import { WebSocketServer, WebSocket } from 'ws';

import { env } from '../../config.js';
import { hasDatabaseConfiguration } from '../../db.js';
import { appLogger } from '../../logging/logger.js';
import { verifyProjectOwnership } from '../../middleware/resourceOwnership.js';
import { getProjectRepository } from '../../repositories/projectRepository.js';
import { authService } from '../../services/authService.js';
import { getNotebook } from '../../services/notebook/notebookCrudService.js';
import type { WSClientMessage, WSServerMessage } from '../../types/notebook.js';

import { acceptWebSocketUpgrade } from './upgradeRouter.js';

// ============================================================
// Types
// ============================================================

interface WSClient {
  id: string;
  ws: WebSocket;
  subscribedNotebooks: Set<string>;
  lastPing: Date;
  userId?: string;
}

// ============================================================
// WebSocket Server Class
// ============================================================

export const NOTEBOOK_WS_PATH = '/ws/notebook';

export class NotebookWSServer {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.wss = new WebSocketServer({
      noServer: true,
      path: NOTEBOOK_WS_PATH,
      perMessageDeflate: false
    });

    this.setupHandlers();
    this.startHeartbeat();

    appLogger.info(`[ws] WebSocket server initialized on ${NOTEBOOK_WS_PATH}`);
  }

  // ============================================================
  // Setup
  // ============================================================

  private setupHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      appLogger.error('[ws] Server error:', error);
    });
  }

  public handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    acceptWebSocketUpgrade(this.wss, req, socket, head);
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    let userId: string | undefined;

    if (hasDatabaseConfiguration()) {
      const url = new URL(req.url ?? '', 'ws://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4401, 'Authentication required');
        return;
      }

      const payload = authService.verifyAccessToken(token);

      if (!payload) {
        ws.close(4401, 'Invalid token');
        return;
      }

      userId = payload.userId;
    }

    const clientId = randomUUID();
    const client: WSClient = {
      id: clientId,
      ws,
      subscribedNotebooks: new Set(),
      lastPing: new Date(),
      userId
    };

    this.clients.set(clientId, client);
    appLogger.info(`[ws] Client connected: ${clientId}`);

    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data.toString());
    });

    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    ws.on('error', (error) => {
      appLogger.error(`[ws] Client ${clientId} error:`, error);
      this.handleDisconnect(clientId);
    });

    ws.on('pong', () => {
      client.lastPing = new Date();
    });
  }

  private handleMessage(clientId: string, message: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const data = JSON.parse(message) as WSClientMessage;

      switch (data.type) {
        case 'subscribe':
          // Ownership verification is async; fire-and-forget the promise so
          // we don't block the JSON parse path. Errors surface via the WS
          // error channel inside the helper.
          void this.authorizeAndSubscribe(clientId, data.notebookId);
          break;

        case 'unsubscribe':
          this.unsubscribeFromNotebook(clientId, data.notebookId);
          break;

        case 'ping':
          client.lastPing = new Date();
          this.sendToClient(clientId, { type: 'pong' });
          break;

        default:
          appLogger.warn(`[ws] Unknown message type from ${clientId}:`, data);
      }
    } catch (error) {
      appLogger.error(`[ws] Failed to parse message from ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid message format'
      });
    }
  }

  /**
   * Verify the connected user owns the project backing this notebook before
   * adding the subscription. In database-disabled dev mode we bypass the
   * check entirely — notebook/project repositories require the DB pool, so
   * there's no source of truth to compare against.
   */
  private async authorizeAndSubscribe(clientId: string, notebookId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Without a database, the notebook/project repositories can't be queried
    // (they throw). Dev + test environments rely on this fallthrough path,
    // which matches the route-level `if (req.user)` pattern used elsewhere.
    if (!hasDatabaseConfiguration()) {
      this.subscribeToNotebook(clientId, notebookId);
      return;
    }

    try {
      const notebook = await getNotebook(notebookId);
      if (!notebook) {
        this.sendToClient(clientId, {
          type: 'error',
          message: `Notebook not found: ${notebookId}`
        });
        return;
      }

      if (client.userId) {
        const project = await verifyProjectOwnership(
          notebook.projectId,
          client.userId,
          getProjectRepository()
        );
        if (!project) {
          this.sendToClient(clientId, {
            type: 'error',
            message: `Not authorized to subscribe to notebook: ${notebookId}`
          });
          return;
        }
      }

      this.subscribeToNotebook(clientId, notebookId);
    } catch (error) {
      appLogger.error(`[ws] Subscribe authorization failed for ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Subscribe authorization failed'
      });
    }
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clean up subscriptions
    client.subscribedNotebooks.clear();
    this.clients.delete(clientId);

    appLogger.info(`[ws] Client disconnected: ${clientId}`);
  }

  // ============================================================
  // Subscription Management
  // ============================================================

  public subscribeToNotebook(clientId: string, notebookId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscribedNotebooks.add(notebookId);
    appLogger.info(`[ws] Client ${clientId} subscribed to notebook ${notebookId}`);

    this.sendToClient(clientId, {
      type: 'subscribed',
      notebookId
    });
  }

  public unsubscribeFromNotebook(clientId: string, notebookId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscribedNotebooks.delete(notebookId);
    appLogger.info(`[ws] Client ${clientId} unsubscribed from notebook ${notebookId}`);

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      notebookId
    });
  }

  // ============================================================
  // Broadcasting
  // ============================================================

  /**
   * Broadcast an event to all clients subscribed to a notebook.
   */
  public broadcastToNotebook(notebookId: string, event: WSServerMessage): void {
    let count = 0;

    for (const [clientId, client] of this.clients) {
      if (client.subscribedNotebooks.has(notebookId)) {
        this.sendToClient(clientId, event);
        count++;
      }
    }

    if (count > 0) {
      appLogger.info(`[ws] Broadcast ${event.type} to ${count} clients for notebook ${notebookId}`);
    }
  }

  /**
   * Send an event to a specific client.
   */
  public sendToClient(clientId: string, event: WSServerMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(event), { compress: false });
      } catch (error) {
        appLogger.error(`[ws] Failed to send to client ${clientId}:`, error);
      }
    }
  }

  // ============================================================
  // Heartbeat
  // ============================================================

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = env.wsHeartbeatMs * 2; // Twice the heartbeat interval

      for (const [clientId, client] of this.clients) {
        const elapsed = now.getTime() - client.lastPing.getTime();

        if (elapsed > timeout) {
          appLogger.info(`[ws] Client ${clientId} timed out, disconnecting`);
          client.ws.terminate();
          this.handleDisconnect(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }, env.wsHeartbeatMs);
  }

  // ============================================================
  // Cleanup
  // ============================================================

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();

    this.wss.close();
    appLogger.info('[ws] WebSocket server closed');
  }

  // ============================================================
  // Stats
  // ============================================================

  public getStats(): { clients: number; subscriptions: number } {
    let subscriptions = 0;
    for (const client of this.clients.values()) {
      subscriptions += client.subscribedNotebooks.size;
    }

    return {
      clients: this.clients.size,
      subscriptions
    };
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let wsServer: NotebookWSServer | null = null;

export function initializeWebSocket(): NotebookWSServer {
  if (wsServer) {
    appLogger.warn('[ws] WebSocket server already initialized');
    return wsServer;
  }

  wsServer = new NotebookWSServer();
  return wsServer;
}

export function getWebSocketServer(): NotebookWSServer | null {
  return wsServer;
}

/**
 * Broadcast an event to all clients subscribed to a notebook.
 * Safe to call even if WebSocket server is not initialized.
 */
export function broadcastNotebookEvent(notebookId: string, event: unknown): void {
  if (!wsServer) return;

  // Cast the event to WSServerMessage - the caller is responsible for sending valid events
  wsServer.broadcastToNotebook(notebookId, event as WSServerMessage);
}
