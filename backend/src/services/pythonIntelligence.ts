/**
 * Python Intelligence Service
 *
 * Unified Jedi-based intelligence for Python notebooks: completions,
 * hover info, call signatures, and diagnostics. All operations are
 * executed inside the project's Docker container via a single Python
 * script that receives its request as JSON over stdin (no shell
 * interpolation, eliminating code-injection risk).
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { Container } from './containerManager.js';
import { execDocker, execDockerWithStdin } from './dockerUtils.js';
import { CONTAINER_PYTHON_SITE_DIR, SITE_DIR_PREAMBLE } from './packageManager/pipHelpers.js';

// ── Result types ────────────────────────────────────────────────

export interface CompletionResult {
    name: string;
    type: string;
    module?: string;
    signature?: string;
    docstring?: string;
}

export interface HoverResult {
    name: string;
    type: string;
    docstring: string;
    fullName?: string;
}

export interface SignatureResult {
    name: string;
    docstring: string;
    params: { name: string; description: string; default?: string }[];
    activeParam: number;
}

export interface DiagnosticResult {
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    message: string;
    severity: 'error';
}

export type IntelligenceResponse = {
    completions?: CompletionResult[];
    hover?: HoverResult | null;
    signatures?: SignatureResult[];
    diagnostics?: DiagnosticResult[];
};

// ── Jedi installation tracking ──────────────────────────────────

const jediInstalledContainers = new Set<string>();

/**
 * Clear all jedi installation tracking state.
 * Should be called when all containers are destroyed.
 */
export function clearJediInstallState(): void {
    jediInstalledContainers.clear();
}

/**
 * Ensure the Jedi library is installed inside the given container.
 */
export async function ensureJediInstalled(container: Container): Promise<void> {
    if (jediInstalledContainers.has(container.containerId)) {
        return;
    }

    // Check if jedi is already available (include custom site dir in sys.path)
    const jediCheckScript = [...SITE_DIR_PREAMBLE, 'import jedi'].join('\n');
    try {
        await execDocker(
            ['exec', container.containerId, 'python', '-c', jediCheckScript],
            { timeout: 3000 }
        );
        jediInstalledContainers.add(container.containerId);
        return;
    } catch {
        // Not installed yet — fall through to install
    }

    try {
        await execDocker(
            [
                'exec', container.containerId,
                'python', '-m', 'pip', 'install',
                '--quiet', '--target', CONTAINER_PYTHON_SITE_DIR,
                'jedi',
            ],
            { timeout: 60000 }
        );
        jediInstalledContainers.add(container.containerId);
    } catch (error) {
        console.warn('[pythonIntelligence] Failed to install jedi:', error);
    }
}

// ── Python script (lazy-loaded, cached) ─────────────────────────

let cachedScript: string | undefined;

function getJediScript(): string {
    if (cachedScript === undefined) {
        const thisDir = dirname(fileURLToPath(import.meta.url));
        cachedScript = readFileSync(
            join(thisDir, 'scripts', 'jediIntelligence.py'),
            'utf8'
        );
    }
    return cachedScript;
}

// ── Main entry point ────────────────────────────────────────────

/**
 * Run a Jedi intelligence operation inside the project container.
 */
export async function pythonIntelligence(
    container: Container,
    request: {
        operation: 'complete' | 'hover' | 'signatures' | 'diagnostics';
        code: string;
        line: number;
        column: number;
        currentCellOffset: number;
    }
): Promise<IntelligenceResponse> {
    await ensureJediInstalled(container);

    const script = getJediScript();
    const payload = JSON.stringify({
        operation: request.operation,
        code: request.code,
        line: request.line,
        column: request.column,
        currentCellOffset: request.currentCellOffset,
    });

    const { stdout } = await execDockerWithStdin(
        ['exec', '-i', container.containerId, 'python', '-c', script],
        payload,
        { timeout: 10_000 }
    );

    try {
        return JSON.parse(stdout.trim()) as IntelligenceResponse;
    } catch {
        return {};
    }
}
