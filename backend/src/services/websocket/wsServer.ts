import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';

import { env } from '../../config.js';
import type { WSClientMessage, WSServerMessage } from '../../types/notebook.js';

// ============================================================
// Types
// ============================================================

interface WSClient {
  id: string;
  ws: WebSocket;
  subscribedNotebooks: Set<string>;
  lastPing: Date;
}

// ============================================================
// WebSocket Server Class
// ============================================================

export class NotebookWSServer {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/notebook'
    });

    this.setupHandlers();
    this.startHeartbeat();

    console.log('[ws] WebSocket server initialized on /ws/notebook');
  }

  // ============================================================
  // Setup
  // ============================================================

  private setupHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    this.wss.on('error', (error) => {
      console.error('[ws] Server error:', error);
    });
  }

  private handleConnection(ws: WebSocket): void {
    const clientId = randomUUID();
    const client: WSClient = {
      id: clientId,
      ws,
      subscribedNotebooks: new Set(),
      lastPing: new Date()
    };

    this.clients.set(clientId, client);
    console.log(`[ws] Client connected: ${clientId}`);

    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data.toString());
    });

    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    ws.on('error', (error) => {
      console.error(`[ws] Client ${clientId} error:`, error);
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
          this.subscribeToNotebook(clientId, data.notebookId);
          break;

        case 'unsubscribe':
          this.unsubscribeFromNotebook(clientId, data.notebookId);
          break;

        case 'ping':
          client.lastPing = new Date();
          this.sendToClient(clientId, { type: 'pong' });
          break;

        default:
          console.warn(`[ws] Unknown message type from ${clientId}:`, data);
      }
    } catch (error) {
      console.error(`[ws] Failed to parse message from ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid message format'
      });
    }
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clean up subscriptions
    client.subscribedNotebooks.clear();
    this.clients.delete(clientId);

    console.log(`[ws] Client disconnected: ${clientId}`);
  }

  // ============================================================
  // Subscription Management
  // ============================================================

  public subscribeToNotebook(clientId: string, notebookId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscribedNotebooks.add(notebookId);
    console.log(`[ws] Client ${clientId} subscribed to notebook ${notebookId}`);

    this.sendToClient(clientId, {
      type: 'subscribed',
      notebookId
    });
  }

  public unsubscribeFromNotebook(clientId: string, notebookId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscribedNotebooks.delete(notebookId);
    console.log(`[ws] Client ${clientId} unsubscribed from notebook ${notebookId}`);

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
      console.log(`[ws] Broadcast ${event.type} to ${count} clients for notebook ${notebookId}`);
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
        client.ws.send(JSON.stringify(event));
      } catch (error) {
        console.error(`[ws] Failed to send to client ${clientId}:`, error);
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
          console.log(`[ws] Client ${clientId} timed out, disconnecting`);
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
    console.log('[ws] WebSocket server closed');
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

export function initializeWebSocket(server: HttpServer): NotebookWSServer {
  if (wsServer) {
    console.warn('[ws] WebSocket server already initialized');
    return wsServer;
  }

  wsServer = new NotebookWSServer(server);
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
