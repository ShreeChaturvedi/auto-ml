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
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(baseUrl?: string) {
    // Derive WebSocket URL from API base URL
    const apiBase = baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';
    this.baseUrl = apiBase
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
      .replace(/\/api$/, '')
      + '/ws/notebook';
  }

  // ============================================================
  // Connection Management
  // ============================================================

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.state.isConnecting) {
        // Already connecting, wait for it
        const checkConnected = setInterval(() => {
          if (this.state.isConnected) {
            clearInterval(checkConnected);
            resolve();
          }
        }, 100);
        return;
      }

      this.state.isConnecting = true;
      console.log('[ws] Connecting to', this.baseUrl);

      try {
        this.ws = new WebSocket(this.baseUrl);

        this.ws.onopen = () => {
          console.log('[ws] Connected');
          this.state.isConnecting = false;
          this.state.isConnected = true;
          this.state.reconnectAttempts = 0;
          this.startPing();
          this.emit('connected', {});
          resolve();
        };

        this.ws.onclose = (event) => {
          console.log('[ws] Disconnected:', event.code, event.reason);
          this.state.isConnecting = false;
          this.state.isConnected = false;
          this.stopPing();
          this.emit('disconnected', { code: event.code, reason: event.reason });
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[ws] Error:', error);
          this.state.isConnecting = false;
          this.emit('error', { error });

          if (!this.state.isConnected) {
            reject(new Error('WebSocket connection failed'));
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        this.state.isConnecting = false;
        reject(error);
      }
    });
  }

  public disconnect(): void {
    this.stopPing();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

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

    setTimeout(() => {
      this.connect()
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
      console.warn('[ws] Cannot subscribe: not connected');
      // Store for later subscription after reconnect
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

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
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
