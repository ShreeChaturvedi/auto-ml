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

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
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
const KERNEL_CHANNEL_OPEN_TIMEOUT_MS = Math.max(env.kernelStartupTimeoutMs, 30_000);
const KERNEL_CHANNEL_OPEN_MAX_ATTEMPTS = 3;

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openKernelChannels(container: KernelContainer, kernelId: string): Promise<WebSocket> {
    const url = wsUrl(container, kernelId);
    let lastError: unknown;

    for (let attempt = 1; attempt <= KERNEL_CHANNEL_OPEN_MAX_ATTEMPTS; attempt += 1) {
        try {
            return await openWebSocket(url, KERNEL_CHANNEL_OPEN_TIMEOUT_MS);
        } catch (error) {
            lastError = error;
            if (attempt < KERNEL_CHANNEL_OPEN_MAX_ATTEMPTS) {
                await wait(500 * attempt);
            }
        }
    }

    throw new Error(
        `Failed to open WebSocket to kernel ${kernelId} on container ${container.id} `
        + `after ${KERNEL_CHANNEL_OPEN_MAX_ATTEMPTS} attempts: `
        + `${lastError instanceof Error ? lastError.message : 'connection failed'}`,
    );
}

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

# Dataset path resolver — always returns a writable path.
# /datasets is mounted read-only; /workspace/datasets is writable.
# When a file is only found in the read-only mount, copy it to the
# writable workspace so subsequent writes (df.to_csv) succeed.
# Paths are scoped by dataset_id to prevent cross-workbook file collisions.
def resolve_dataset_path(filename, dataset_id=None):
    import shutil
    # Prefer dataset_id-scoped paths first to isolate workbook file writes.
    writable = []
    if dataset_id:
        writable.append(Path("/workspace/datasets") / dataset_id / filename)
    writable.extend([
        Path("/workspace/datasets") / filename,
        Path("/workspace") / filename,
    ])
    for c in writable:
        if c.exists():
            return str(c)
    readonly = []
    if dataset_id:
        readonly.append(Path("/datasets") / dataset_id / filename)
    readonly.append(Path("/datasets") / filename)
    for c in readonly:
        if c.exists():
            # Copy to dataset_id-scoped writable path to avoid collisions.
            if dataset_id:
                dest = Path("/workspace/datasets") / dataset_id / filename
            else:
                dest = Path("/workspace/datasets") / filename
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(c), str(dest))
            return str(dest)
    for root in [Path("/workspace"), Path("/workspace/datasets")]:
        if root.exists():
            matches = list(root.rglob(filename))
            if matches:
                return str(matches[0])
    for root in [Path("/datasets")]:
        if root.exists():
            matches = list(root.rglob(filename))
            if matches:
                if dataset_id:
                    dest = Path("/workspace/datasets") / dataset_id / filename
                else:
                    dest = Path("/workspace/datasets") / filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(str(matches[0]), str(dest))
                return str(dest)
    return str(writable[0])

# DataFrame display helper
def _display_df(df):
    from IPython.display import display, HTML
    display(HTML(df.to_html(max_rows=100, max_cols=50, notebook=True)))

# Preprocessing helpers — called by generated cell code so the user sees
# exactly what runs (no invisible wrapping).
def load_preprocessing_dataset(filename, dataset_id, file_type, df_name):
    """Load a dataset into the kernel namespace, reusing a cached copy if available."""
    import pandas as pd
    # Cache key includes dataset_id to prevent cross-workbook data leaks.
    cache_key = "_automl_ds_" + df_name + "_" + str(dataset_id or "")
    if cache_key in globals() and isinstance(globals()[cache_key], pd.DataFrame):
        globals()[df_name] = globals()[cache_key].copy()
        return globals()[df_name]
    path = resolve_dataset_path(filename, dataset_id)
    if file_type == "json":
        try:
            frame = pd.read_json(path)
        except ValueError:
            frame = pd.read_json(path, lines=True)
    elif file_type == "xlsx":
        frame = pd.read_excel(path)
    else:
        frame = pd.read_csv(path)
    globals()[df_name] = frame
    globals()[cache_key] = frame.copy()
    globals()["dataset_path"] = path
    globals()["active_dataset_id"] = dataset_id
    return frame

def save_preprocessing_dataset(filename, dataset_id, file_type, df_name):
    """Validate the dataframe and write it back to disk."""
    import pandas as pd
    frame = globals().get(df_name)
    if frame is None:
        raise ValueError(f"Preprocessing cell must leave the active dataframe in variable '{df_name}'.")
    if not isinstance(frame, pd.DataFrame):
        raise TypeError(f"Preprocessing variable '{df_name}' must be a pandas DataFrame.")
    path = resolve_dataset_path(filename, dataset_id)
    if file_type == "json":
        frame.to_json(path, orient="records")
    elif file_type == "xlsx":
        frame.to_excel(path, index=False)
    else:
        frame.to_csv(path, index=False)
    # Invalidate cache after save — the data on disk is now transformed,
    # so a fresh load (e.g. from another workbook) must re-read from disk.
    cache_key = "_automl_ds_" + df_name + "_" + str(dataset_id or "")
    globals().pop(cache_key, None)

# Standalone-notebook export helper. Writes the dataframe to an internal
# _exports directory and appends to a manifest the backend reads after the
# cell finishes. The backend atomically persists each manifest entry as a
# new project dataset, so users can promote exploration results without
# leaving the notebook.
def save_to_project(df, name):
    """Save a DataFrame as a project dataset."""
    import os, json, re, time, uuid
    if not isinstance(df, __import__('pandas').DataFrame):
        raise TypeError("save_to_project expects a pandas DataFrame")
    name = str(name).strip()
    if not re.match(r'^[\\w\\- ]+$', name):
        raise ValueError("Dataset name can only contain letters, numbers, spaces, dashes, underscores")
    if not name.endswith('.csv'):
        name = name + '.csv'
    export_dir = '/workspace/_exports'
    os.makedirs(export_dir, exist_ok=True)
    path = os.path.join(export_dir, name)
    df.to_csv(path, index=False)
    rows, cols = df.shape
    manifest_path = os.path.join(export_dir, '.manifest.json')
    entries = []
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path) as f:
                entries = json.load(f)
        except Exception:
            entries = []
    entries.append({
        'name': name,
        'rows': rows,
        'cols': cols,
        'timestamp': time.time(),
        'exportId': str(uuid.uuid4()),
    })
    tmp = manifest_path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(entries, f)
    os.replace(tmp, manifest_path)
    print(f"Saved '{name.rsplit('.csv', 1)[0]}' to project ({rows:,} rows x {cols} columns)")

print("Kernel initialized")
`.trim();

const KERNEL_SITE_REFRESH_CODE = `
import importlib, site, sys
site.addsitedir("/workspace/.python")
if "/workspace/.python" not in sys.path:
    sys.path.insert(0, "/workspace/.python")
importlib.invalidate_caches()
print("Kernel package cache refreshed")
`.trim();

function buildKernelImportVerificationCode(moduleNames: string[]): string {
    const payload = JSON.stringify(moduleNames);
    return `
import importlib
import json
import site
import sys

site.addsitedir("/workspace/.python")
if "/workspace/.python" not in sys.path:
    sys.path.insert(0, "/workspace/.python")
importlib.invalidate_caches()

modules = json.loads(${JSON.stringify(payload)})
for module_name in modules:
    importlib.import_module(module_name)
print("Kernel package import verification passed")
`.trim();
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
        // WS is dead — terminate stale socket and reconnect
        if (conn.ws) {
            conn.ws.removeAllListeners();
            conn.ws.terminate();
        }
        conn.ws = await openKernelChannels(container, conn.kernelId);
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
    try {
        const ws = await openKernelChannels(container, kernel.id);
        kernels.set(container.id, {
            kernelId: kernel.id,
            gatewayUrl: base,
            ws,
            sessionId,
        });
    } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Failed to open WebSocket to kernel');
    }

    // Run kernel init code (environment setup, helpers)
    try {
        await execute(container, KERNEL_INIT_CODE, 30_000);
    } catch (err) {
        appLogger.warn(
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
 * Refresh Python import caches inside a live kernel after an out-of-band pip install.
 * This preserves notebook state while making newly installed packages importable.
 */
export async function refreshKernelPythonPath(container: KernelContainer): Promise<void> {
    if (!hasKernel(container)) {
        return;
    }

    const result = await execute(container, KERNEL_SITE_REFRESH_CODE, 10_000);
    if (result.status !== 'success') {
        throw new Error(result.error || result.stderr || 'Failed to refresh kernel package cache');
    }
}

export async function verifyKernelImports(
    container: KernelContainer,
    moduleNames: string[],
    timeoutMs = 20_000,
): Promise<void> {
    const uniqueModuleNames = Array.from(new Set(moduleNames.map((value) => value.trim()).filter(Boolean)));
    if (uniqueModuleNames.length === 0) {
        return;
    }

    const result = await execute(
        container,
        buildKernelImportVerificationCode(uniqueModuleNames),
        timeoutMs,
    );
    if (result.status !== 'success') {
        throw new Error(result.error || result.stderr || 'Kernel import verification failed');
    }
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
    conn.ws = await openKernelChannels(container, conn.kernelId);

    // Re-run init code so helpers (resolve_dataset_path, load/save_preprocessing_dataset)
    // survive kernel restarts — fixes #132.
    await execute(container, KERNEL_INIT_CODE, 30_000);
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
        appLogger.warn(`[kernelManager] Error shutting down kernel ${conn.kernelId}:`, err);
    }

    kernels.delete(container.id);
}

/**
 * Check whether a kernel connection is cached for the given container.
 */
export function hasKernel(container: KernelContainer): boolean {
    return kernels.has(container.id);
}
