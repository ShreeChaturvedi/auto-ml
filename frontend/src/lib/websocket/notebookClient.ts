import { useAuthStore } from '@/stores/authStore';
import { getWebSocketUrl } from '@/lib/api/client';
import type {
  WSClientMessage,
  WSServerMessage,
  WSServerMessageType
} from '@/types/notebook';

// ============================================================
// Types
// ============================================================

type EventCallback<T = unknown> = (data: T) => void;

interface ConnectionState {
  isConnecting: boolean;
  isConnected: boolean;
  reconnectAttempts: number;
}

// ============================================================
// WebSocket Client Class
// ============================================================

export class NotebookWSClient {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private subscribedNotebook: string | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private state: ConnectionState = {
    isConnecting: false,
    isConnected: false,
    reconnectAttempts: 0
  };
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private stableConnectionMs = 5000;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private stableConnectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(baseUrl?: string) {
    this.baseUrl = getWebSocketUrl('/ws/notebook', baseUrl);
  }

  // ============================================================
  // Connection Management
  // ============================================================

  public connect(isReconnect = false): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (
      (this.state.isConnecting || this.ws?.readyState === WebSocket.CONNECTING)
      && this.connectPromise
    ) {
      return this.connectPromise;
    }

    this.state.isConnecting = true;
    if (!isReconnect) {
      this.state.reconnectAttempts = 0;
    }
    this.intentionalClose = false;
    console.log('[ws] Connecting to', this.baseUrl);

    const connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        const token = useAuthStore.getState().accessToken;
        const url = token ? `${this.baseUrl}?token=${encodeURIComponent(token)}` : this.baseUrl;
        const socket = new WebSocket(url);
        this.ws = socket;

        socket.onopen = () => {
          if (this.ws !== socket) {
            socket.close(1000, 'Superseded connection');
            return;
          }

          console.log('[ws] Connected');
          this.state.isConnecting = false;
          this.state.isConnected = true;
          this.connectPromise = null;
          this.stopConnectionTimeout();
          this.startPing();
          this.startStableConnectionTimer(socket);
          this.emit('connected', {});
          resolve();
        };

        socket.onclose = (event) => {
          if (this.ws !== socket) {
            return;
          }

          console.log('[ws] Disconnected:', event.code, event.reason);
          this.ws = null;
          this.state.isConnecting = false;
          this.state.isConnected = false;
          this.connectPromise = null;
          this.stopConnectionTimeout();
          this.stopPing();
          this.stopStableConnectionTimer();
          this.emit('disconnected', { code: event.code, reason: event.reason });

          if (event.code === 4401) {
            this.intentionalClose = true;
          }

          if (!this.intentionalClose) {
            this.attemptReconnect();
          }
        };

        socket.onerror = (error) => {
          if (this.ws !== socket) {
            return;
          }

          console.error('[ws] Error:', error);
          this.state.isConnecting = false;
          this.connectPromise = null;
          this.stopConnectionTimeout();
          this.emit('error', { error });

          if (!this.state.isConnected) {
            reject(new Error('WebSocket connection failed'));
          }
        };

        socket.onmessage = (event) => {
          if (this.ws !== socket) {
            return;
          }

          this.handleMessage(event.data);
        };
      } catch (error) {
        this.state.isConnecting = false;
        this.connectPromise = null;
        this.stopConnectionTimeout();
        reject(error);
      }
    });

    const timeout = new Promise<void>((_, reject) => {
      this.stopConnectionTimeout();
      this.connectionTimeout = setTimeout(() => {
        this.connectionTimeout = null;
        this.connectPromise = null;
        reject(new Error('WebSocket connection timed out'));
      }, 10000);
    });

    this.connectPromise = Promise.race([connectionPromise, timeout]);
    return this.connectPromise;
  }

  public disconnect(): void {
    this.stopConnectionTimeout();
    this.stopPing();
    this.stopStableConnectionTimer();
    this.intentionalClose = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    const socket = this.ws;
    this.ws = null;

    if (socket) {
      socket.close(1000, 'Client disconnect');
    }

    this.connectPromise = null;
    this.state.isConnected = false;
    this.state.isConnecting = false;
    this.state.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    this.subscribedNotebook = null;
  }

  private attemptReconnect(): void {
    if (this.state.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[ws] Max reconnect attempts reached');
      return;
    }

    this.state.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.state.reconnectAttempts - 1);

    console.log(`[ws] Reconnecting in ${delay}ms (attempt ${this.state.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect(true)
        .then(() => {
          // Re-subscribe to notebook if we were subscribed
          if (this.subscribedNotebook) {
            this.subscribe(this.subscribedNotebook);
          }
        })
        .catch(() => {
          // Will retry via onclose handler
        });
    }, delay);
  }

  // ============================================================
  // Subscription
  // ============================================================

  public subscribe(notebookId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Store for later subscription after reconnect — not an error,
      // subscribe is commonly called before the connection is open.
      this.subscribedNotebook = notebookId;
      return;
    }

    this.subscribedNotebook = notebookId;
    this.send({ type: 'subscribe', notebookId });
  }

  public unsubscribe(notebookId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.subscribedNotebook = null;
      return;
    }

    if (this.subscribedNotebook === notebookId) {
      this.subscribedNotebook = null;
    }

    this.send({ type: 'unsubscribe', notebookId });
  }

  // ============================================================
  // Message Handling
  // ============================================================

  private send(message: WSClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[ws] Cannot send: not connected');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WSServerMessage;
      this.emit(message.type, message);
    } catch (error) {
      console.error('[ws] Failed to parse message:', error);
    }
  }

  // ============================================================
  // Ping/Pong
  // ============================================================

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private startStableConnectionTimer(socket: WebSocket): void {
    this.stopStableConnectionTimer();
    this.stableConnectionTimeout = setTimeout(() => {
      if (this.ws === socket && socket.readyState === WebSocket.OPEN) {
        this.state.reconnectAttempts = 0;
      }
      this.stableConnectionTimeout = null;
    }, this.stableConnectionMs);
  }

  private stopStableConnectionTimer(): void {
    if (this.stableConnectionTimeout) {
      clearTimeout(this.stableConnectionTimeout);
      this.stableConnectionTimeout = null;
    }
  }

  // ============================================================
  // Event Emitter
  // ============================================================

  public on<T = WSServerMessage>(event: WSServerMessageType | 'connected' | 'disconnected' | 'error', callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const callbacks = this.listeners.get(event)!;
    callbacks.add(callback as EventCallback);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback as EventCallback);
    };
  }

  public off(event: string, callback: EventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emit(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(data);
        } catch (error) {
          console.error(`[ws] Error in ${event} callback:`, error);
        }
      }
    }
  }

  // ============================================================
  // State Getters
  // ============================================================

  public get isConnected(): boolean {
    return this.state.isConnected;
  }

  public get isConnecting(): boolean {
    return this.state.isConnecting;
  }

  public get currentNotebook(): string | null {
    return this.subscribedNotebook;
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let wsClient: NotebookWSClient | null = null;

export function getNotebookWSClient(): NotebookWSClient {
  if (!wsClient) {
    wsClient = new NotebookWSClient();
  }
  return wsClient;
}

export function resetNotebookWSClient(): void {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
}
