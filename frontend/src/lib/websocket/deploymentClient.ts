import { useAuthStore } from '@/stores/authStore';
import type { DeploymentWSEvent } from '@/types/deployment';

type EventCallback = (data: DeploymentWSEvent) => void;

export class DeploymentWSClient {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private subscribedDeployment: string | null = null;
  private listeners: Set<EventCallback> = new Set();
  private _isConnecting = false;
  private _isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(baseUrl?: string) {
    const apiBase = baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';
    this.baseUrl = apiBase
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
      .replace(/\/api$/, '')
      + '/ws/deployment';
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) { resolve(); return; }
      if (this._isConnecting) { resolve(); return; }
      this._isConnecting = true;

      const token = useAuthStore.getState().accessToken;
      const url = token ? `${this.baseUrl}?token=${encodeURIComponent(token)}` : this.baseUrl;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._isConnecting = false;
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.startPing();
        if (this.subscribedDeployment) {
          this.send({ type: 'subscribe', deploymentId: this.subscribedDeployment });
        }
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as DeploymentWSEvent;
          for (const cb of this.listeners) cb(data);
        } catch { /* ignore parse errors */ }
      };

      this.ws.onclose = () => {
        this._isConnecting = false;
        this._isConnected = false;
        this.stopPing();
        this.maybeReconnect();
      };

      this.ws.onerror = () => {
        this._isConnecting = false;
        reject(new Error('WebSocket connection failed'));
      };
    });
  }

  subscribe(deploymentId: string) {
    this.subscribedDeployment = deploymentId;
    this.send({ type: 'subscribe', deploymentId });
  }

  unsubscribe(deploymentId: string) {
    this.send({ type: 'unsubscribe', deploymentId });
    if (this.subscribedDeployment === deploymentId) {
      this.subscribedDeployment = null;
    }
  }

  onEvent(callback: EventCallback) {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  disconnect() {
    this.subscribedDeployment = null;
    this.stopPing();
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
  }

  get isConnected(): boolean { return this._isConnected; }
  get isConnecting(): boolean { return this._isConnecting; }

  private send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30_000);
  }

  private stopPing() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
  }

  private maybeReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => { this.connect().catch(() => {}); }, delay);
  }
}

// Singleton
let client: DeploymentWSClient | null = null;

export function getDeploymentWSClient(): DeploymentWSClient {
  if (!client) client = new DeploymentWSClient();
  return client;
}
