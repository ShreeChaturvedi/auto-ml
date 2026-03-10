/**
 * Docker Utilities
 *
 * Low-level Docker CLI helpers shared across container management services.
 */

import { execFile, type ExecFileOptions } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function execDocker(
    args: string[],
    options: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string }> {
    const result = await execFileAsync('docker', args, {
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
        ...options
    });
    return {
        stdout: typeof result.stdout === 'string' ? result.stdout : result.stdout.toString('utf8'),
        stderr: typeof result.stderr === 'string' ? result.stderr : result.stderr.toString('utf8')
    };
}
