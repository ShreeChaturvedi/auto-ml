/**
 * Python Completions
 *
 * Provides Python code completions using the Jedi library
 * running inside a Docker container. Delegates to the unified
 * pythonIntelligence service.
 */

import type { Container } from './containerManager.js';
import { pythonIntelligence, clearJediInstallState } from './pythonIntelligence.js';

/**
 * Python completion result
 */
export interface PythonCompletion {
    name: string;
    type: 'function' | 'class' | 'module' | 'variable' | 'keyword' | 'statement' | 'param' | 'property';
    module?: string;
    signature?: string;
    docstring?: string;
}

export { clearJediInstallState };

/**
 * Get Python completions using Jedi
 */
export async function getCompletions(
    container: Container,
    code: string,
    line: number,
    column: number
): Promise<PythonCompletion[]> {
    try {
        const result = await pythonIntelligence(container, {
            operation: 'complete',
            code,
            line,
            column,
            currentCellOffset: 0,
        });

        if (!result.completions) return [];

        return result.completions.map((c) => ({
            name: c.name,
            type: c.type as PythonCompletion['type'],
            module: c.module,
            signature: c.signature,
            docstring: c.docstring,
        }));
    } catch {
        return [];
    }
}
