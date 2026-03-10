/**
 * Python Completions
 *
 * Provides Python code completions using the Jedi library
 * running inside a Docker container.
 */

import type { Container } from './containerManager.js';
import { execDocker } from './dockerUtils.js';

const CONTAINER_PYTHON_SITE_DIR = '/workspace/.python';

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

// Track jedi installation status per container
const jediInstalledContainers = new Set<string>();

/**
 * Clear all jedi installation tracking state.
 * Should be called when all containers are destroyed.
 */
export function clearJediInstallState(): void {
    jediInstalledContainers.clear();
}

async function ensureJediInstalled(container: Container): Promise<void> {
    if (jediInstalledContainers.has(container.containerId)) {
        return;
    }

    // Check if jedi is installed
    try {
        await execDocker([
            'exec',
            container.containerId,
            'python',
            '-c',
            'import jedi'
        ], { timeout: 3000 });
        jediInstalledContainers.add(container.containerId);
        return;
    } catch {
        // Jedi not installed, install it
    }

    try {
        await execDocker([
            'exec',
            container.containerId,
            'python',
            '-m',
            'pip',
            'install',
            '--quiet',
            '--target',
            CONTAINER_PYTHON_SITE_DIR,
            'jedi'
        ], { timeout: 60000 });
        jediInstalledContainers.add(container.containerId);
    } catch (error) {
        console.warn('[containerManager] Failed to install jedi:', error);
    }
}

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
        // First ensure jedi is installed
        await ensureJediInstalled(container);

        // Create a script that gets completions using Jedi
        const script = `
import sys
import json

# Ensure jedi is available
try:
    import jedi
except ImportError:
    print("[]")
    sys.exit(0)

code = '''${code.replace(/'/g, "\\'")}'''

try:
    script = jedi.Script(code)
    completions = script.complete(${line}, ${column})

    results = []
    for c in completions[:50]:  # Limit to 50 completions
        comp = {
            "name": c.name,
            "type": c.type or "statement"
        }
        if c.module_name:
            comp["module"] = c.module_name

        # Get signature for functions
        try:
            sigs = c.get_signatures()
            if sigs:
                comp["signature"] = str(sigs[0])
        except:
            pass

        # Get docstring (truncated)
        try:
            doc = c.docstring()
            if doc:
                comp["docstring"] = doc[:200]
        except:
            pass

        results.append(comp)

    print(json.dumps(results))
except Exception as e:
    print(json.dumps([]))
`;

        const { stdout } = await execDocker([
            'exec',
            container.containerId,
            'python',
            '-c',
            script
        ], { timeout: 5000 });

        try {
            const completions = JSON.parse(stdout.trim()) as PythonCompletion[];
            return completions;
        } catch {
            return [];
        }
    } catch {
        return [];
    }
}
