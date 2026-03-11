/**
 * Kernel Manager — Jupyter Protocol Helpers
 *
 * Types, constants, and low-level networking utilities for talking to a
 * Jupyter Kernel Gateway over REST and WebSocket.
 */

import { WebSocket } from 'ws';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Minimal container shape — only the fields we need. */
export interface KernelContainer {
    id: string;
    kernelGatewayPort: number;
}

export interface KernelConnection {
    kernelId: string;
    gatewayUrl: string;
    ws: WebSocket | null;
    sessionId: string;
}

/** Jupyter wire-protocol message envelope */
export interface JupyterMessage {
    header: {
        msg_id: string;
        msg_type: string;
        session: string;
        username: string;
        version: string;
        date?: string;
    };
    parent_header: Record<string, unknown>;
    metadata: Record<string, unknown>;
    content: Record<string, unknown>;
    channel: string;
    buffers?: unknown[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

export const JUPYTER_PROTOCOL_VERSION = '5.3';
export const JUPYTER_USERNAME = 'automl';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

export function gatewayUrl(container: KernelContainer): string {
    return `http://127.0.0.1:${container.kernelGatewayPort}`;
}

export function wsUrl(container: KernelContainer, kernelId: string): string {
    return `ws://127.0.0.1:${container.kernelGatewayPort}/api/kernels/${kernelId}/channels`;
}

/**
 * Open a WebSocket to the kernel channels endpoint with a ready-promise.
 * Resolves once the connection is open; rejects on error or timeout.
 */
export function openWebSocket(url: string, timeoutMs = 10_000): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
            ws.terminate();
            reject(new Error(`WebSocket connection to ${url} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        ws.once('open', () => {
            clearTimeout(timer);
            resolve(ws);
        });
        ws.once('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

/**
 * Strip ANSI escape sequences from traceback lines for cleaner display.
 */
export function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Fetch a Kernel Gateway REST endpoint, wrapping connection errors with
 * context about the kernel/container involved.
 */
export async function gatewayFetch(
    conn: KernelConnection,
    path: string,
    method: 'POST' | 'DELETE',
    action: string,
): Promise<Response> {
    let res: Response;
    try {
        res = await fetch(`${conn.gatewayUrl}${path}`, { method });
    } catch (err) {
        throw new Error(
            `Cannot reach Kernel Gateway to ${action} kernel ${conn.kernelId}: ` +
            `${err instanceof Error ? err.message : 'connection failed'}`,
        );
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Failed to ${action} kernel: ${res.status} ${body}`);
    }
    return res;
}
