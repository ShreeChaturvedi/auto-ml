/**
 * Kernel Manager
 *
 * Manages Jupyter kernel connections via raw HTTP/WebSocket to a Kernel
 * Gateway running inside Docker containers.  Each container exposes the
 * standard Jupyter REST + WebSocket API on its `kernelGatewayPort`.
 *
 * Public surface:
 *   connectKernel   — start a kernel and open the WebSocket channel
 *   execute          — run code and stream outputs back via onOutput
 *   interruptKernel  — send SIGINT to the kernel
 *   restartKernel    — restart and reconnect
 *   shutdownKernel   — tear down kernel + WebSocket, remove from cache
 */

import { randomUUID } from 'crypto';

import { WebSocket } from 'ws';

import type { ExecutionResult, RichOutput } from '../types/execution.js';

import { executeOnKernel } from './kernel/execution.js';
import { gatewayFetch, gatewayUrl, openWebSocket, wsUrl, type KernelConnection, type KernelContainer } from './kernel/jupyterProtocol.js';

// Re-export types and protocol helpers so existing `import * as kernelManager` callers
// and direct type imports continue to work.
export type { KernelContainer, KernelConnection, JupyterMessage } from './kernel/jupyterProtocol.js';
export {
    JUPYTER_PROTOCOL_VERSION,
    JUPYTER_USERNAME,
    gatewayUrl,
    wsUrl,
    openWebSocket,
    stripAnsi,
    gatewayFetch,
} from './kernel/jupyterProtocol.js';

/* ------------------------------------------------------------------ */
/*  Module-level cache                                                */
/* ------------------------------------------------------------------ */

const kernels = new Map<string, KernelConnection>();

/* ------------------------------------------------------------------ */
/*  Kernel init code — runs once after a kernel is first connected    */
/* ------------------------------------------------------------------ */

const KERNEL_INIT_CODE = `
import os, sys
from pathlib import Path

# Environment setup
os.environ["MPLBACKEND"] = "Agg"
os.environ.setdefault("PIP_TARGET", "/workspace/.python")
if "/workspace/.python" not in sys.path:
    sys.path.insert(0, "/workspace/.python")
try:
    os.chdir("/workspace")
except OSError:
    pass

# Dataset path resolver
def resolve_dataset_path(filename, dataset_id=None):
    candidates = [
        Path("/workspace") / filename,
        Path("/workspace/datasets") / filename,
        Path("/datasets") / filename,
    ]
    if dataset_id:
        candidates.extend([
            Path("/workspace/datasets") / dataset_id / filename,
            Path("/datasets") / dataset_id / filename,
        ])
    for c in candidates:
        if c.exists():
            return str(c)
    for root in [Path("/workspace"), Path("/workspace/datasets"), Path("/datasets")]:
        if root.exists():
            matches = list(root.rglob(filename))
            if matches:
                return str(matches[0])
    return str(candidates[0])

# DataFrame display helper
def _display_df(df):
    from IPython.display import display, HTML
    display(HTML(df.to_html(max_rows=100, max_cols=50, notebook=True)))

print("Kernel initialized")
`.trim();

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Start a kernel on the given container's Kernel Gateway and open the
 * WebSocket channels connection.  The connection is cached so that
 * subsequent calls for the same container are no-ops.
 */
export async function connectKernel(container: KernelContainer): Promise<void> {
    if (kernels.has(container.id)) {
        // Already connected — ensure WS is alive
        const conn = kernels.get(container.id)!;
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
            return;
        }
        // WS is dead — terminate stale socket and reconnect
        if (conn.ws) {
            conn.ws.removeAllListeners();
            conn.ws.terminate();
        }
        conn.ws = await openWebSocket(wsUrl(container, conn.kernelId));
        return;
    }

    const base = gatewayUrl(container);
    const sessionId = randomUUID();

    if (!container.kernelGatewayPort || container.kernelGatewayPort <= 0) {
        throw new Error(
            `Kernel Gateway port is not available for container ${container.id}. ` +
            'The container may have failed to start or the port mapping was not configured.',
        );
    }

    // Start a new kernel via REST
    let res: Response;
    try {
        res = await fetch(`${base}/api/kernels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'python3' }),
        });
    } catch (err) {
        throw new Error(
            `Cannot connect to Kernel Gateway at ${base} for container ${container.id}: ` +
            `${err instanceof Error ? err.message : 'connection failed'}. ` +
            'Ensure the container is running and Kernel Gateway has started.',
        );
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Failed to start kernel on container ${container.id}: ${res.status} ${body}`);
    }

    const kernel = (await res.json()) as { id: string; name: string };

    // Open WebSocket channels
    let ws: WebSocket;
    try {
        ws = await openWebSocket(wsUrl(container, kernel.id));
    } catch (err) {
        throw new Error(
            `Failed to open WebSocket to kernel ${kernel.id} on container ${container.id}: ` +
            `${err instanceof Error ? err.message : 'connection failed'}`,
        );
    }

    kernels.set(container.id, {
        kernelId: kernel.id,
        gatewayUrl: base,
        ws,
        sessionId,
    });

    // Run kernel init code (environment setup, helpers)
    try {
        await execute(container, KERNEL_INIT_CODE, 30_000);
    } catch (err) {
        console.warn(
            `[kernelManager] Kernel init failed for container ${container.id}:`,
            err instanceof Error ? err.message : err,
        );
    }
}

/**
 * Execute code on the kernel inside `container`.
 *
 * Returns an {@link ExecutionResult} matching the shape produced by the
 * existing container-exec system so callers don't need to change.
 *
 * @param onOutput  Optional streaming callback — invoked for every
 *                  discrete output (stdout chunk, image, chart, error, …)
 */
export async function execute(
    container: KernelContainer,
    code: string,
    timeoutMs: number,
    onOutput?: (output: RichOutput) => void,
): Promise<ExecutionResult> {
    return executeOnKernel(connectKernel, kernels, container, code, timeoutMs, onOutput);
}

/**
 * Send an interrupt signal to the running kernel.
 */
export async function interruptKernel(container: KernelContainer): Promise<void> {
    const conn = kernels.get(container.id);
    if (!conn) {
        throw new Error(`No kernel connection for container ${container.id}`);
    }

    await gatewayFetch(conn, `/api/kernels/${conn.kernelId}/interrupt`, 'POST', 'interrupt');
}

/**
 * Restart the kernel and re-establish the WebSocket connection.
 * The kernel ID remains the same after a restart.
 */
export async function restartKernel(container: KernelContainer): Promise<void> {
    const conn = kernels.get(container.id);
    if (!conn) {
        throw new Error(`No kernel connection for container ${container.id}`);
    }

    // Tear down existing WebSocket before restart
    if (conn.ws) {
        conn.ws.removeAllListeners();
        conn.ws.terminate();
        conn.ws = null;
    }

    await gatewayFetch(conn, `/api/kernels/${conn.kernelId}/restart`, 'POST', 'restart');

    // Reconnect WebSocket with fresh session
    conn.sessionId = randomUUID();
    conn.ws = await openWebSocket(wsUrl(container, conn.kernelId));
}

/**
 * Shut down the kernel, close the WebSocket, and remove from cache.
 */
export async function shutdownKernel(container: KernelContainer): Promise<void> {
    const conn = kernels.get(container.id);
    if (!conn) return; // nothing to do

    // Close WebSocket first
    if (conn.ws) {
        try {
            conn.ws.close();
        } catch {
            // Ignore close errors
        }
        conn.ws = null;
    }

    // DELETE the kernel via REST (container may already be gone — log but don't throw)
    try {
        await gatewayFetch(conn, `/api/kernels/${conn.kernelId}`, 'DELETE', 'shut down');
    } catch (err) {
        console.warn(`[kernelManager] Error shutting down kernel ${conn.kernelId}:`, err);
    }

    kernels.delete(container.id);
}

