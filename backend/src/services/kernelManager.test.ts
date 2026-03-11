/**
 * Unit tests for kernelManager.ts
 *
 * Mocking strategy:
 * - global.fetch is mocked via vi.fn()
 * - `ws` WebSocket class is mocked via vi.mock with hoisted factory
 * - `translateMimeBundle` from mimeTranslator is mocked
 * - `crypto.randomUUID` is mocked for deterministic IDs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted state shared between mock factories and tests             */
/* ------------------------------------------------------------------ */

const hoisted = vi.hoisted(() => {
    const mockTranslateMimeBundle = vi.fn().mockReturnValue({ type: 'text' as const, content: 'translated' });
    const wsInstances: Array<{
        _listeners: Record<string, Array<(...args: unknown[]) => void>>;
        readyState: number;
        url: string;
        send: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
        on: (event: string, fn: (...args: unknown[]) => void) => void;
        once: (event: string, fn: (...args: unknown[]) => void) => void;
        emit: (event: string, ...args: unknown[]) => void;
        removeListener: (event: string, fn: (...args: unknown[]) => void) => void;
        removeAllListeners: (event?: string) => void;
    }> = [];
    const uuidState = { counter: 0 };

    return { mockTranslateMimeBundle, wsInstances, uuidState };
});

/* ------------------------------------------------------------------ */
/*  Mock: ws WebSocket                                                */
/* ------------------------------------------------------------------ */

vi.mock('ws', () => {
    class MockWebSocket {
        static OPEN = 1;
        static CLOSED = 3;

        _listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
        readyState = 1; // OPEN
        url: string;
        send = vi.fn((payload: string) => {
            try {
                const parsed = JSON.parse(payload) as {
                    header?: { msg_id?: string; msg_type?: string };
                    content?: { code?: string };
                };
                const msgId = parsed.header?.msg_id;
                const code = parsed.content?.code ?? '';
                if (
                    parsed.header?.msg_type === 'execute_request'
                    && msgId
                    && code.includes('Kernel initialized')
                ) {
                    queueMicrotask(() => {
                        this.emit('message', JSON.stringify({
                            header: {
                                msg_id: `reply-${msgId}`,
                                msg_type: 'execute_reply',
                                session: 's',
                                username: 'u',
                                version: '5.3',
                            },
                            parent_header: { msg_id: msgId },
                            metadata: {},
                            content: { status: 'ok', execution_count: 1 },
                            channel: 'shell',
                        }));
                    });
                }
            } catch {
                // Test helpers sometimes assert on raw send payloads; ignore parse failures.
            }
        });
        close = vi.fn(function (this: MockWebSocket) {
            this.readyState = 3; // CLOSED
        });
        terminate = vi.fn(function (this: MockWebSocket) {
            this.readyState = 3; // CLOSED
        });

        constructor(url: string) {
            this.url = url;
            hoisted.wsInstances.push(this);

            // Auto-fire 'open' on next microtask so openWebSocket resolves
            queueMicrotask(() => this.emit('open'));
        }

        on(event: string, fn: (...args: unknown[]) => void) {
            if (!this._listeners[event]) this._listeners[event] = [];
            this._listeners[event].push(fn);
            return this;
        }

        once(event: string, fn: (...args: unknown[]) => void) {
            const wrapped = (...args: unknown[]) => {
                this.removeListener(event, wrapped);
                fn(...args);
            };
            (wrapped as Record<string, unknown>)._original = fn;
            return this.on(event, wrapped);
        }

        emit(event: string, ...args: unknown[]) {
            const fns = this._listeners[event];
            if (fns) {
                // Copy so removals mid-iteration are safe
                for (const fn of [...fns]) {
                    fn(...args);
                }
            }
            return this;
        }

        removeListener(event: string, fn: (...args: unknown[]) => void) {
            const fns = this._listeners[event];
            if (fns) {
                this._listeners[event] = fns.filter(
                    (f) => f !== fn && (f as Record<string, unknown>)._original !== fn,
                );
            }
            return this;
        }

        removeAllListeners(event?: string) {
            if (event) {
                delete this._listeners[event];
            } else {
                this._listeners = {};
            }
            return this;
        }
    }

    return { WebSocket: MockWebSocket };
});

/* ------------------------------------------------------------------ */
/*  Mock: mimeTranslator                                              */
/* ------------------------------------------------------------------ */

vi.mock('./mimeTranslator.js', () => ({
    translateMimeBundle: hoisted.mockTranslateMimeBundle,
}));

/* ------------------------------------------------------------------ */
/*  Mock: crypto.randomUUID                                           */
/* ------------------------------------------------------------------ */

vi.mock('crypto', () => ({
    randomUUID: () => `uuid-${++hoisted.uuidState.counter}`,
}));

/* ------------------------------------------------------------------ */
/*  Mock: global.fetch                                                */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/* ------------------------------------------------------------------ */
/*  Import SUT (after mocks are registered)                           */
/* ------------------------------------------------------------------ */

import {
    connectKernel,
    execute,
    interruptKernel,
    restartKernel,
    shutdownKernel,
    hasKernel,
    type KernelContainer,
} from './kernelManager.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const { mockTranslateMimeBundle, wsInstances, uuidState } = hoisted;

type MockWs = (typeof wsInstances)[number];

function getWsInstance(index: number): MockWs {
    return wsInstances[index];
}

function lastWs(): MockWs {
    return wsInstances[wsInstances.length - 1];
}

function makeContainer(overrides: Partial<KernelContainer> = {}): KernelContainer {
    return { id: 'ctr-1', kernelGatewayPort: 9999, ...overrides };
}

/** Create a minimal Response-like object returned by mockFetch. */
function okResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response;
}

function errorResponse(status: number, body = ''): Response {
    return {
        ok: false,
        status,
        json: () => Promise.reject(new Error('not json')),
        text: () => Promise.resolve(body),
    } as unknown as Response;
}

/**
 * Build a Jupyter wire-protocol message to feed into the WebSocket mock.
 */
function jupyterMsg(
    msgType: string,
    content: Record<string, unknown>,
    parentMsgId: string,
): string {
    return JSON.stringify({
        header: { msg_id: `reply-${msgType}`, msg_type: msgType, session: 's', username: 'u', version: '5.3' },
        parent_header: { msg_id: parentMsgId },
        metadata: {},
        content,
        channel: msgType === 'execute_reply' ? 'shell' : 'iopub',
    });
}

/**
 * Helper: connect a container so it is cached. Returns the mock WS.
 */
async function connectDefault(container?: KernelContainer): Promise<MockWs> {
    const ctr = container ?? makeContainer();
    mockFetch.mockResolvedValueOnce(okResponse({ id: 'kernel-1', name: 'python3' }));
    await connectKernel(ctr);
    return lastWs();
}

/* ------------------------------------------------------------------ */
/*  Module-level cache reset between tests                            */
/* ------------------------------------------------------------------ */

let activeContainers: KernelContainer[] = [];

beforeEach(() => {
    wsInstances.length = 0;
    mockFetch.mockReset();
    mockTranslateMimeBundle.mockReset();
    mockTranslateMimeBundle.mockReturnValue({ type: 'text', content: 'translated' });
    uuidState.counter = 0;
    activeContainers = [];
});

afterEach(async () => {
    mockFetch.mockReset();
    for (const ctr of activeContainers) {
        mockFetch.mockResolvedValueOnce(okResponse({}));
        await shutdownKernel(ctr).catch(() => {});
    }
    wsInstances.length = 0;
});

/** Track containers so afterEach can clean them up. */
function track(ctr: KernelContainer) {
    if (!activeContainers.find((c) => c.id === ctr.id)) {
        activeContainers.push(ctr);
    }
    return ctr;
}

/* ================================================================== */
/*  Tests                                                             */
/* ================================================================== */

/* ---------- connectKernel ---------- */

describe('connectKernel', () => {
    it('1. starts a kernel via REST POST and opens WebSocket on success', async () => {
        const ctr = track(makeContainer());
        mockFetch.mockResolvedValueOnce(okResponse({ id: 'kernel-abc', name: 'python3' }));

        await connectKernel(ctr);

        // Verify REST POST to correct URL
        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe('http://127.0.0.1:9999/api/kernels');
        expect(opts.method).toBe('POST');

        // Verify WebSocket was opened to the right endpoint
        const ws = getWsInstance(0);
        expect(ws).toBeDefined();
        expect(ws.url).toBe('ws://127.0.0.1:9999/api/kernels/kernel-abc/channels');

        expect(hasKernel(ctr)).toBe(true);
    });

    it('2. is a no-op when already connected with an open WebSocket (cache hit)', async () => {
        const ctr = track(makeContainer());
        mockFetch.mockResolvedValueOnce(okResponse({ id: 'k1', name: 'python3' }));

        await connectKernel(ctr);

        const wsBefore = wsInstances.length;
        // Second call should not POST or create a new WS
        await connectKernel(ctr);

        expect(mockFetch).toHaveBeenCalledTimes(1); // no second POST
        expect(wsInstances.length).toBe(wsBefore); // no new WS
    });

    it('3. reconnects WebSocket when cached but WS is dead', async () => {
        const ctr = track(makeContainer());
        mockFetch.mockResolvedValueOnce(okResponse({ id: 'k1', name: 'python3' }));

        await connectKernel(ctr);
        const firstWs = getWsInstance(0);

        // Simulate dead WS (readyState = CLOSED = 3)
        firstWs.readyState = 3;

        await connectKernel(ctr);

        // Should NOT have made another fetch POST (kernel is already started)
        expect(mockFetch).toHaveBeenCalledTimes(1);
        // But should have created a new WebSocket
        expect(wsInstances.length).toBe(2);
        const secondWs = getWsInstance(1);
        expect(secondWs.url).toContain('/api/kernels/k1/channels');
    });

    it('4. throws descriptive error when port is 0', async () => {
        const ctr = makeContainer({ kernelGatewayPort: 0 });

        await expect(connectKernel(ctr)).rejects.toThrow(/port is not available/i);
        await expect(connectKernel(ctr)).rejects.toThrow(ctr.id);
    });

    it('4b. throws descriptive error when port is negative', async () => {
        const ctr = makeContainer({ kernelGatewayPort: -1 });

        await expect(connectKernel(ctr)).rejects.toThrow(/port is not available/i);
    });

    it('5. throws descriptive error when fetch throws (connection refused)', async () => {
        const ctr = makeContainer();
        mockFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9999'));

        await expect(connectKernel(ctr)).rejects.toThrow(/Cannot connect to Kernel Gateway/);
    });

    it('5b. wraps non-Error throw from fetch', async () => {
        const ctr = makeContainer();
        mockFetch.mockRejectedValueOnce('some string error');

        await expect(connectKernel(ctr)).rejects.toThrow(/Cannot connect to Kernel Gateway/);
    });

    it('6. throws with status when fetch returns non-ok', async () => {
        const ctr = makeContainer();
        mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'));

        await expect(connectKernel(ctr)).rejects.toThrow(/500/);
    });
});

/* ---------- execute ---------- */

describe('execute', () => {
    /**
     * Helper: connect, then return the WS and the expected msgId that
     * execute will use for the execute_request message.
     */
    async function setupExecution(ctr?: KernelContainer) {
        const container = track(ctr ?? makeContainer());
        const ws = await connectDefault(container);
        ws.send.mockClear();

        // The next randomUUID call inside `execute` will produce the execution msg_id.
        const expectedMsgId = `uuid-${uuidState.counter + 1}`;

        return { container, ws, expectedMsgId };
    }

    it('7. simple print (stream stdout) returns text output', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, 'print("hello")', 5000);

        // Wait for execute to send the message
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        // Simulate stdout stream
        ws.emit('message', jupyterMsg('stream', { name: 'stdout', text: 'hello\n' }, expectedMsgId));
        // Simulate execute_reply ok
        ws.emit('message', jupyterMsg('execute_reply', { status: 'ok', execution_count: 1 }, expectedMsgId));

        const result = await resultPromise;
        expect(result.status).toBe('success');
        expect(result.stdout).toBe('hello\n');
        expect(result.executionOrder).toBe(1);
    });

    it('8. stderr stream accumulates stderr', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, 'import warnings', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        ws.emit('message', jupyterMsg('stream', { name: 'stderr', text: 'warn: foo\n' }, expectedMsgId));
        ws.emit('message', jupyterMsg('stream', { name: 'stderr', text: 'warn: bar\n' }, expectedMsgId));
        ws.emit('message', jupyterMsg('execute_reply', { status: 'ok' }, expectedMsgId));

        const result = await resultPromise;
        expect(result.status).toBe('success');
        expect(result.stderr).toBe('warn: foo\nwarn: bar\n');
    });

    it('9. display_data with MIME bundle calls translateMimeBundle', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();
        mockTranslateMimeBundle.mockReturnValue({ type: 'image', content: 'data:image/png;base64,abc' });

        const resultPromise = execute(container, 'display(img)', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        const bundle = { 'image/png': 'abc123' };
        ws.emit('message', jupyterMsg('display_data', { data: bundle }, expectedMsgId));
        ws.emit('message', jupyterMsg('execute_reply', { status: 'ok' }, expectedMsgId));

        const result = await resultPromise;
        expect(mockTranslateMimeBundle).toHaveBeenCalledWith(bundle);
        expect(result.outputs).toHaveLength(1);
        expect(result.outputs[0].type).toBe('image');
    });

    it('10. execute_result sets executionOrder', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();
        mockTranslateMimeBundle.mockReturnValue({ type: 'text', content: '42' });

        const resultPromise = execute(container, '40+2', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        ws.emit('message', jupyterMsg('execute_result', {
            data: { 'text/plain': '42' },
            execution_count: 7,
        }, expectedMsgId));
        ws.emit('message', jupyterMsg('execute_reply', { status: 'ok', execution_count: 7 }, expectedMsgId));

        const result = await resultPromise;
        expect(result.executionOrder).toBe(7);
        expect(result.outputs).toHaveLength(1);
    });

    it('11. error message returns error output with stripped ANSI', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, '1/0', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        ws.emit('message', jupyterMsg('error', {
            ename: 'ZeroDivisionError',
            evalue: 'division by zero',
            traceback: [
                '\x1b[0;31mZeroDivisionError\x1b[0m: division by zero',
                '\x1b[1;32m----> 1\x1b[0m 1/0',
            ],
        }, expectedMsgId));
        ws.emit('message', jupyterMsg('execute_reply', { status: 'error' }, expectedMsgId));

        const result = await resultPromise;
        expect(result.status).toBe('error');
        expect(result.error).toBe('ZeroDivisionError: division by zero');
        // Verify ANSI was stripped from stderr
        // eslint-disable-next-line no-control-regex
        expect(result.stderr).not.toMatch(/\x1b/);
        expect(result.stderr).toContain('ZeroDivisionError');
        expect(result.stderr).toContain('----> 1');
        // Error output should also be in outputs array
        expect(result.outputs.some((o) => o.type === 'error')).toBe(true);
    });

    it('12. timeout resolves with timeout status', async () => {
        const { container, ws } = await setupExecution();

        // Use a very short timeout
        const resultPromise = execute(container, 'import time; time.sleep(999)', 50);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        // Don't send any reply - let the timeout fire
        const result = await resultPromise;
        expect(result.status).toBe('timeout');
        expect(result.error).toMatch(/timed out/i);
    });

    it('13. WebSocket close during execution resolves with error', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, 'code', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        // Send one stdout then close unexpectedly
        ws.emit('message', jupyterMsg('stream', { name: 'stdout', text: 'partial' }, expectedMsgId));
        ws.emit('close');

        const result = await resultPromise;
        expect(result.status).toBe('error');
        expect(result.error).toMatch(/WebSocket closed unexpectedly/);
        expect(result.stdout).toBe('partial');
    });

    it('14. onOutput callback receives each output incrementally', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();
        mockTranslateMimeBundle.mockReturnValue({ type: 'html', content: '<b>hi</b>' });

        const received: Array<{ type: string; content: string }> = [];
        const onOutput = vi.fn((output: { type: string; content: string }) => received.push(output));

        const resultPromise = execute(container, 'code', 5000, onOutput);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        ws.emit('message', jupyterMsg('stream', { name: 'stdout', text: 'line1\n' }, expectedMsgId));
        ws.emit('message', jupyterMsg('stream', { name: 'stderr', text: 'err\n' }, expectedMsgId));
        ws.emit('message', jupyterMsg('display_data', { data: { 'text/html': '<b>hi</b>' } }, expectedMsgId));
        ws.emit('message', jupyterMsg('execute_reply', { status: 'ok' }, expectedMsgId));

        await resultPromise;

        expect(onOutput).toHaveBeenCalledTimes(3);
        expect(received[0]).toEqual({ type: 'text', content: 'line1\n' });
        expect(received[1]).toEqual({ type: 'error', content: 'err\n' }); // stderr -> type 'error'
        expect(received[2]).toEqual({ type: 'html', content: '<b>hi</b>' });
    });

    it('15. execute_reply with ok status returns success', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, 'x=1', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        ws.emit('message', jupyterMsg('execute_reply', { status: 'ok', execution_count: 3 }, expectedMsgId));

        const result = await resultPromise;
        expect(result.status).toBe('success');
        expect(result.executionOrder).toBe(3);
    });

    it('16. execute_reply with error status returns error (ename/evalue from reply)', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, 'bad', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        // No prior error message on iopub - the execute_reply itself carries the error
        ws.emit('message', jupyterMsg('execute_reply', {
            status: 'error',
            ename: 'SyntaxError',
            evalue: 'invalid syntax',
        }, expectedMsgId));

        const result = await resultPromise;
        expect(result.status).toBe('error');
        expect(result.error).toBe('SyntaxError: invalid syntax');
    });

    it('16b. execute_reply with abort status returns error', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, 'code', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        ws.emit('message', jupyterMsg('execute_reply', { status: 'abort' }, expectedMsgId));

        const result = await resultPromise;
        expect(result.status).toBe('error');
        expect(result.error).toBe('Execution aborted');
    });

    it('ignores messages with different parent_header msg_id', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, 'code', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        // Send a message with a different parent msg_id - should be ignored
        ws.emit('message', jupyterMsg('stream', { name: 'stdout', text: 'not mine' }, 'other-id'));

        // Now send the real reply
        ws.emit('message', jupyterMsg('execute_reply', { status: 'ok' }, expectedMsgId));

        const result = await resultPromise;
        expect(result.stdout).toBe(''); // The "not mine" message was ignored
    });

    it('ignores non-JSON frames', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, 'code', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        // Send invalid JSON - should not throw
        ws.emit('message', 'this is not json{{{');
        ws.emit('message', jupyterMsg('execute_reply', { status: 'ok' }, expectedMsgId));

        const result = await resultPromise;
        expect(result.status).toBe('success');
    });

    it('sends properly structured execute_request message', async () => {
        const { container, ws, expectedMsgId } = await setupExecution();

        const resultPromise = execute(container, 'print(1)', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        const sent = JSON.parse(ws.send.mock.calls[0][0]);
        expect(sent.header.msg_type).toBe('execute_request');
        expect(sent.header.msg_id).toBe(expectedMsgId);
        expect(sent.content.code).toBe('print(1)');
        expect(sent.content.silent).toBe(false);
        expect(sent.content.allow_stdin).toBe(false);
        expect(sent.content.stop_on_error).toBe(true);
        expect(sent.channel).toBe('shell');

        // Finish the execution
        ws.emit('message', jupyterMsg('execute_reply', { status: 'ok' }, expectedMsgId));
        await resultPromise;
    });
});

/* ---------- interruptKernel ---------- */

describe('interruptKernel', () => {
    it('17. successful interrupt sends POST to correct endpoint', async () => {
        const ctr = track(makeContainer());
        await connectDefault(ctr);

        mockFetch.mockResolvedValueOnce(okResponse({}));
        await interruptKernel(ctr);

        // The second fetch call (first was connectKernel's POST)
        const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        expect(lastCall[0]).toMatch(/\/api\/kernels\/kernel-1\/interrupt$/);
        expect(lastCall[1].method).toBe('POST');
    });

    it('18. throws when no kernel connection exists', async () => {
        const ctr = makeContainer({ id: 'no-such-container' });
        await expect(interruptKernel(ctr)).rejects.toThrow(/No kernel connection/);
    });

    it('19. throws descriptive error when fetch fails', async () => {
        const ctr = track(makeContainer());
        await connectDefault(ctr);

        mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        await expect(interruptKernel(ctr)).rejects.toThrow(/Cannot reach Kernel Gateway to interrupt/);
    });

    it('19b. throws when fetch returns non-ok status', async () => {
        const ctr = track(makeContainer());
        await connectDefault(ctr);

        mockFetch.mockResolvedValueOnce(errorResponse(404, 'Not Found'));
        await expect(interruptKernel(ctr)).rejects.toThrow(/Failed to interrupt kernel.*404/);
    });
});

/* ---------- restartKernel ---------- */

describe('restartKernel', () => {
    it('20. closes old WS, POSTs restart, opens new WS', async () => {
        const ctr = track(makeContainer());
        const oldWs = await connectDefault(ctr);

        mockFetch.mockResolvedValueOnce(okResponse({})); // restart response
        await restartKernel(ctr);

        // Old WS should have been torn down before reconnecting
        expect(oldWs.terminate).toHaveBeenCalled();

        // REST POST to restart endpoint
        const restartCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        expect(restartCall[0]).toMatch(/\/api\/kernels\/kernel-1\/restart$/);
        expect(restartCall[1].method).toBe('POST');

        // A new WebSocket should have been opened
        const newWs = lastWs();
        expect(newWs).not.toBe(oldWs);
        expect(newWs.url).toContain('/api/kernels/kernel-1/channels');
    });

    it('21. throws when no kernel connection exists', async () => {
        const ctr = makeContainer({ id: 'no-conn' });
        await expect(restartKernel(ctr)).rejects.toThrow(/No kernel connection/);
    });

    it('21b. throws when restart fetch fails', async () => {
        const ctr = track(makeContainer());
        await connectDefault(ctr);

        mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        await expect(restartKernel(ctr)).rejects.toThrow(/Cannot reach Kernel Gateway to restart/);
    });

    it('21c. throws when restart returns non-ok status', async () => {
        const ctr = track(makeContainer());
        await connectDefault(ctr);

        mockFetch.mockResolvedValueOnce(errorResponse(500, 'error'));
        await expect(restartKernel(ctr)).rejects.toThrow(/Failed to restart kernel.*500/);
    });
});

/* ---------- shutdownKernel ---------- */

describe('shutdownKernel', () => {
    it('22. DELETEs kernel, closes WS, removes from cache', async () => {
        const ctr = track(makeContainer());
        const ws = await connectDefault(ctr);

        expect(hasKernel(ctr)).toBe(true);

        mockFetch.mockResolvedValueOnce(okResponse({})); // DELETE response
        await shutdownKernel(ctr);

        expect(ws.close).toHaveBeenCalled();

        // DELETE to correct URL
        const deleteCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        expect(deleteCall[0]).toMatch(/\/api\/kernels\/kernel-1$/);
        expect(deleteCall[1].method).toBe('DELETE');

        // Removed from cache
        expect(hasKernel(ctr)).toBe(false);

        // Remove from activeContainers since we already shut it down
        activeContainers = activeContainers.filter((c) => c.id !== ctr.id);
    });

    it('23. no-op when no connection exists', async () => {
        const ctr = makeContainer({ id: 'nonexistent' });

        // Should not throw
        await shutdownKernel(ctr);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('24. DELETE fails with non-ok status - logs warning but does not throw', async () => {
        const ctr = track(makeContainer());
        await connectDefault(ctr);

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'));
        // Should not throw even though DELETE returned 500
        await shutdownKernel(ctr);

        expect(warnSpy).toHaveBeenCalled();
        expect(hasKernel(ctr)).toBe(false);

        warnSpy.mockRestore();
        activeContainers = activeContainers.filter((c) => c.id !== ctr.id);
    });

    it('24b. DELETE throws network error - logs warning but does not throw', async () => {
        const ctr = track(makeContainer());
        await connectDefault(ctr);

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        await shutdownKernel(ctr);

        expect(warnSpy).toHaveBeenCalled();
        expect(hasKernel(ctr)).toBe(false);

        warnSpy.mockRestore();
        activeContainers = activeContainers.filter((c) => c.id !== ctr.id);
    });
});

/* ---------- hasKernel ---------- */

describe('hasKernel', () => {
    it('25. returns true when connected, false when not', async () => {
        const ctr = track(makeContainer());

        expect(hasKernel(ctr)).toBe(false);

        await connectDefault(ctr);
        expect(hasKernel(ctr)).toBe(true);

        mockFetch.mockResolvedValueOnce(okResponse({}));
        await shutdownKernel(ctr);
        expect(hasKernel(ctr)).toBe(false);

        activeContainers = activeContainers.filter((c) => c.id !== ctr.id);
    });
});

/* ---------- stripAnsi (indirect) ---------- */

describe('stripAnsi (via error handling)', () => {
    it('26. ANSI codes are removed from error tracebacks', async () => {
        const ctr = track(makeContainer());
        const ws = await connectDefault(ctr);

        uuidState.counter = 1; // next will be uuid-2
        const expectedMsgId = 'uuid-2';
        const resultPromise = execute(ctr, '1/0', 5000);
        await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

        const ansiTraceback = [
            '\x1b[0;31m---------------------------------------------------------------------------\x1b[0m',
            '\x1b[0;31mZeroDivisionError\x1b[0m                         Traceback (most recent call last)',
            '\x1b[0;32m      1\x1b[0m \x1b[0;36m1\x1b[0m\x1b[0;34m/\x1b[0m\x1b[0;36m0\x1b[0m',
            '\x1b[0;31mZeroDivisionError\x1b[0m: division by zero',
        ];

        ws.emit('message', jupyterMsg('error', {
            ename: 'ZeroDivisionError',
            evalue: 'division by zero',
            traceback: ansiTraceback,
        }, expectedMsgId));
        ws.emit('message', jupyterMsg('execute_reply', { status: 'error' }, expectedMsgId));

        const result = await resultPromise;

        // No ANSI escape codes should remain in stderr
        // eslint-disable-next-line no-control-regex
        expect(result.stderr).not.toMatch(/\x1b\[/);
        // But the actual text content should be preserved
        expect(result.stderr).toContain('ZeroDivisionError');
        expect(result.stderr).toContain('division by zero');
        expect(result.stderr).toContain('Traceback (most recent call last)');
        expect(result.stderr).toContain('---------------------------------------------------------------------------');

        // The error output in outputs should also be clean
        const errorOutput = result.outputs.find((o) => o.type === 'error');
        expect(errorOutput).toBeDefined();
        // eslint-disable-next-line no-control-regex
        expect(errorOutput!.content).not.toMatch(/\x1b\[/);
    });
});
