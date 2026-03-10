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

import type { ExecutionResult, ExecutionStatus, RichOutput } from '../types/execution.js';

import { translateMimeBundle, type MimeBundle } from './mimeTranslator.js';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Minimal container shape — only the fields we need. */
export interface KernelContainer {
    id: string;
    kernelGatewayPort: number;
}

interface KernelConnection {
    kernelId: string;
    gatewayUrl: string;
    ws: WebSocket | null;
    sessionId: string;
}

/* Jupyter wire-protocol message envelope */
interface JupyterMessage {
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
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function gatewayUrl(container: KernelContainer): string {
    return `http://127.0.0.1:${container.kernelGatewayPort}`;
}

function wsUrl(container: KernelContainer, kernelId: string): string {
    return `ws://127.0.0.1:${container.kernelGatewayPort}/api/kernels/${kernelId}/channels`;
}

/**
 * Open a WebSocket to the kernel channels endpoint with a ready-promise.
 * Resolves once the connection is open; rejects on error or timeout.
 */
function openWebSocket(url: string, timeoutMs = 10_000): Promise<WebSocket> {
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
function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Fetch a Kernel Gateway REST endpoint, wrapping connection errors with
 * context about the kernel/container involved.
 */
async function gatewayFetch(
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
        // WS is dead — reconnect
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
    // Ensure connected
    await connectKernel(container);
    const conn = kernels.get(container.id)!;

    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket for container ${container.id} is not open`);
    }

    /* ---- build execute_request ---- */
    const msgId = randomUUID();
    const executeMsg: JupyterMessage = {
        header: {
            msg_id: msgId,
            msg_type: 'execute_request',
            session: conn.sessionId,
            username: 'automl',
            version: '5.3',
            date: new Date().toISOString(),
        },
        parent_header: {},
        metadata: {},
        content: {
            code,
            silent: false,
            store_history: true,
            user_expressions: {},
            allow_stdin: false,
            stop_on_error: true,
        },
        channel: 'shell',
    };

    /* ---- accumulators ---- */
    let stdout = '';
    let stderr = '';
    const outputs: RichOutput[] = [];
    let executionOrder: number | null = null;
    let status: ExecutionStatus = 'running';
    let errorMessage: string | undefined;

    const startTime = Date.now();

    return new Promise<ExecutionResult>((resolve, reject) => {
        const ws = conn.ws!;
        let settled = false;

        /* ---- timeout guard ---- */
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve({
                status: 'timeout',
                stdout,
                stderr,
                outputs,
                executionMs: Date.now() - startTime,
                error: `Execution timed out after ${timeoutMs}ms`,
                executionOrder,
            });
        }, timeoutMs);

        /* ---- message handler ---- */
        function onMessage(raw: WebSocket.Data) {
            if (settled) return;

            let msg: JupyterMessage;
            try {
                msg = JSON.parse(raw.toString()) as JupyterMessage;
            } catch {
                return; // ignore non-JSON frames
            }

            // Only handle messages that are responses to *our* request
            const parentMsgId = (msg.parent_header as Record<string, unknown>)?.msg_id;
            if (parentMsgId !== msgId) return;

            const { msg_type } = msg.header;
            const content = msg.content;

            switch (msg_type) {
                /* ---------- IOPub messages ---------- */

                case 'stream': {
                    const name = content.name as string;
                    const text = content.text as string;
                    if (name === 'stdout') {
                        stdout += text;
                        onOutput?.({ type: 'text', content: text });
                    } else if (name === 'stderr') {
                        stderr += text;
                        onOutput?.({ type: 'error', content: text });
                    }
                    break;
                }

                case 'display_data':
                case 'execute_result': {
                    const bundle = (content.data ?? {}) as MimeBundle;
                    const rich = translateMimeBundle(bundle);
                    outputs.push(rich);
                    onOutput?.(rich);
                    if (msg_type === 'execute_result' && content.execution_count != null) {
                        executionOrder = content.execution_count as number;
                    }
                    break;
                }

                case 'error': {
                    const ename = content.ename as string;
                    const evalue = content.evalue as string;
                    const traceback = (content.traceback as string[]) ?? [];
                    const cleanTb = traceback.map(stripAnsi).join('\n');
                    errorMessage = `${ename}: ${evalue}`;
                    stderr += cleanTb + '\n';

                    const errorOutput: RichOutput = {
                        type: 'error',
                        content: cleanTb || errorMessage,
                    };
                    outputs.push(errorOutput);
                    onOutput?.(errorOutput);
                    break;
                }

                case 'execute_input':
                case 'status':
                    // Ignored — execute_input is just an echo, status is
                    // informational (busy/idle).  Completion is signalled
                    // by execute_reply on the shell channel.
                    break;

                /* ---------- Shell reply ---------- */

                case 'execute_reply': {
                    const replyStatus = content.status as string;
                    if (replyStatus === 'ok') {
                        status = 'success';
                    } else if (replyStatus === 'error') {
                        status = 'error';
                        // If we haven't captured the error from iopub yet
                        if (!errorMessage) {
                            const ename = content.ename as string | undefined;
                            const evalue = content.evalue as string | undefined;
                            errorMessage = ename ? `${ename}: ${evalue}` : 'Execution error';
                        }
                    } else if (replyStatus === 'abort') {
                        status = 'error';
                        errorMessage = errorMessage ?? 'Execution aborted';
                    }

                    if (content.execution_count != null) {
                        executionOrder = content.execution_count as number;
                    }

                    // Consolidate accumulated stdout/stderr into outputs
                    // so they get persisted alongside rich outputs.
                    if (stdout) {
                        outputs.unshift({ type: 'text', content: stdout });
                    }
                    if (stderr && !errorMessage) {
                        // Only add stderr as a separate output if it's not
                        // already represented by an error traceback output.
                        outputs.push({ type: 'error', content: stderr });
                    }

                    // Done — resolve
                    settled = true;
                    cleanup();
                    resolve({
                        status,
                        stdout,
                        stderr,
                        outputs,
                        executionMs: Date.now() - startTime,
                        error: errorMessage,
                        executionOrder,
                    });
                    break;
                }

                default:
                    break;
            }
        }

        function onError(err: Error) {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
        }

        function onClose() {
            if (settled) return;
            settled = true;
            cleanup();
            resolve({
                status: 'error',
                stdout,
                stderr,
                outputs,
                executionMs: Date.now() - startTime,
                error: 'WebSocket closed unexpectedly during execution',
                executionOrder,
            });
        }

        function cleanup() {
            clearTimeout(timer);
            ws.removeListener('message', onMessage);
            ws.removeListener('error', onError);
            ws.removeListener('close', onClose);
        }

        ws.on('message', onMessage);
        ws.on('error', onError);
        ws.on('close', onClose);

        // Send the execute request
        ws.send(JSON.stringify(executeMsg));
    });
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

    // Close existing WebSocket before restart
    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close();
    }
    conn.ws = null;

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

/**
 * Check whether a kernel is currently cached for the given container.
 */
export function hasKernel(container: KernelContainer): boolean {
    return kernels.has(container.id);
}
