import type { IncomingMessage } from 'http';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'node:net';

import { WebSocketServer, WebSocket } from 'ws';

import { env } from '../../config.js';
import { hasDatabaseConfiguration } from '../../db.js';
import { appLogger } from '../../logging/logger.js';
import { authService } from '../../services/authService.js';
import type { DeploymentRecord, DeploymentWSEvent } from '../../types/deployment.js';

// ============================================================
// Types
// ============================================================

interface WSClient {
  id: string;
  ws: WebSocket;
  subscribedDeployments: Set<string>;
  lastPing: Date;
  userId?: string;
}

type DeploymentWSClientMessage =
  | { type: 'subscribe'; deploymentId: string }
  | { type: 'unsubscribe'; deploymentId: string }
  | { type: 'ping' };

// ============================================================
// WebSocket Server Class
// ============================================================

export class DeploymentWSServer {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /** Optional callback to fetch the current snapshot for a deployment on subscribe. */
  private snapshotFetcher: ((deploymentId: string) => Promise<DeploymentRecord | null>) | null = null;

  constructor() {
    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false
    });
    this.setupHandlers();
    this.startHeartbeat();
    appLogger.info('[deployment-ws] WebSocket server initialized on /ws/deployment');
  }

  // ============================================================
  // Setup
  // ============================================================

  private setupHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      appLogger.error('[deployment-ws] Server error:', error);
    });
  }

  public handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
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
      subscribedDeployments: new Set(),
      lastPing: new Date(),
      userId
    };

    this.clients.set(clientId, client);
    appLogger.info(`[deployment-ws] Client connected: ${clientId}`);

    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data.toString());
    });

    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    ws.on('error', (error) => {
      appLogger.error(`[deployment-ws] Client ${clientId} error:`, error);
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
      const data = JSON.parse(message) as DeploymentWSClientMessage;

      switch (data.type) {
        case 'subscribe':
          void this.subscribeToDeployment(clientId, data.deploymentId);
          break;

        case 'unsubscribe':
          this.unsubscribeFromDeployment(clientId, data.deploymentId);
          break;

        case 'ping':
          client.lastPing = new Date();
          try { client.ws.send(JSON.stringify({ type: 'pong' }), { compress: false }); } catch { /* ignore */ }
          break;

        default:
          appLogger.warn(`[deployment-ws] Unknown message type from ${clientId}:`, data);
      }
    } catch (error) {
      appLogger.error(`[deployment-ws] Failed to parse message from ${clientId}:`, error);
      try { client.ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }), { compress: false }); } catch { /* ignore */ }
    }
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscribedDeployments.clear();
    this.clients.delete(clientId);

    appLogger.info(`[deployment-ws] Client disconnected: ${clientId}`);
  }

  // ============================================================
  // Subscription Management
  // ============================================================

  public async subscribeToDeployment(clientId: string, deploymentId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscribedDeployments.add(deploymentId);
    appLogger.info(`[deployment-ws] Client ${clientId} subscribed to deployment ${deploymentId}`);

    // Send snapshot of current state if a fetcher is registered
    if (this.snapshotFetcher) {
      try {
        const deployment = await this.snapshotFetcher(deploymentId);
        if (deployment && client.ws.readyState === WebSocket.OPEN) {
          const event: DeploymentWSEvent = { type: 'deployment_snapshot', deployment };
          client.ws.send(JSON.stringify(event), { compress: false });
        }
      } catch (err) {
        appLogger.error(`[deployment-ws] Failed to fetch snapshot for deployment ${deploymentId}:`, err);
      }
    }
  }

  public unsubscribeFromDeployment(clientId: string, deploymentId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscribedDeployments.delete(deploymentId);
    appLogger.info(`[deployment-ws] Client ${clientId} unsubscribed from deployment ${deploymentId}`);
  }

  /**
   * Register a callback that returns the current DeploymentRecord for snapshot-on-subscribe.
   */
  public setSnapshotFetcher(fn: (deploymentId: string) => Promise<DeploymentRecord | null>): void {
    this.snapshotFetcher = fn;
  }

  // ============================================================
  // Broadcasting
  // ============================================================

  /**
   * Broadcast a deployment event to all clients subscribed to the given deploymentId.
   */
  public broadcastDeploymentEvent(deploymentId: string, event: DeploymentWSEvent): void {
    let count = 0;

    for (const [, client] of this.clients) {
      if (client.subscribedDeployments.has(deploymentId) && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(event), { compress: false });
          count++;
        } catch { /* ignore send errors for individual clients */ }
      }
    }

    if (count > 0) {
      appLogger.info(`[deployment-ws] Broadcast ${event.type} to ${count} clients for deployment ${deploymentId}`);
    }
  }

  // ============================================================
  // Heartbeat
  // ============================================================

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = env.wsHeartbeatMs * 2;

      // Snapshot keys to prevent mutation during iteration
      const clientIds = [...this.clients.keys()];
      for (const clientId of clientIds) {
        const client = this.clients.get(clientId);
        if (!client) continue;

        const elapsed = now.getTime() - client.lastPing.getTime();

        if (elapsed > timeout) {
          appLogger.info(`[deployment-ws] Client ${clientId} timed out, disconnecting`);
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
    appLogger.info('[deployment-ws] WebSocket server closed');
  }

  // ============================================================
  // Stats
  // ============================================================

  public getStats(): { clients: number; subscriptions: number } {
    let subscriptions = 0;
    for (const client of this.clients.values()) {
      subscriptions += client.subscribedDeployments.size;
    }
    return { clients: this.clients.size, subscriptions };
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let deploymentWsServer: DeploymentWSServer | null = null;

export function initializeDeploymentWebSocket(): DeploymentWSServer {
  if (deploymentWsServer) {
    appLogger.warn('[deployment-ws] WebSocket server already initialized');
    return deploymentWsServer;
  }

  deploymentWsServer = new DeploymentWSServer();
  return deploymentWsServer;
}

export function getDeploymentWSServer(): DeploymentWSServer | null {
  return deploymentWsServer;
}

/**
 * Broadcast a deployment event. Safe to call even when the WS server is not initialized.
 */
export function broadcastDeploymentEvent(deploymentId: string, event: DeploymentWSEvent): void {
  deploymentWsServer?.broadcastDeploymentEvent(deploymentId, event);
}
