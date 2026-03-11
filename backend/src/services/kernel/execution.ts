/**
 * Kernel Manager — Code Execution
 *
 * Sends an execute_request to a Jupyter kernel via WebSocket,
 * collects IOPub outputs, and resolves with a unified ExecutionResult.
 */

import { randomUUID } from 'crypto';

import { WebSocket } from 'ws';

import type { ExecutionResult, ExecutionStatus, RichOutput } from '../../types/execution.js';
import { translateMimeBundle, type MimeBundle } from '../mimeTranslator.js';

import type { JupyterMessage, KernelConnection, KernelContainer } from './jupyterProtocol.js';
import { JUPYTER_PROTOCOL_VERSION, JUPYTER_USERNAME, stripAnsi } from './jupyterProtocol.js';

/**
 * Execute code on a kernel connection.
 *
 * @param ensureConnected  Callback that guarantees the kernel is connected
 *                         before we attempt to send. This avoids a circular
 *                         dependency between execution and connection logic.
 * @param kernels          The module-level kernel connection cache.
 * @param container        Target container.
 * @param code             Python code to run.
 * @param timeoutMs        Hard timeout in milliseconds.
 * @param onOutput         Optional streaming callback.
 */
export async function executeOnKernel(
    ensureConnected: (container: KernelContainer) => Promise<void>,
    kernels: Map<string, KernelConnection>,
    container: KernelContainer,
    code: string,
    timeoutMs: number,
    onOutput?: (output: RichOutput) => void,
): Promise<ExecutionResult> {
    // Ensure connected
    await ensureConnected(container);
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
            username: JUPYTER_USERNAME,
            version: JUPYTER_PROTOCOL_VERSION,
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
