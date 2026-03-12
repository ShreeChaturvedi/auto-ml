/**
 * Docker Utilities
 *
 * Low-level Docker CLI helpers shared across container management services.
 */

import { execFile, spawn, type ExecFileOptions } from 'child_process';
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

/**
 * Execute a docker command, piping data via stdin.
 *
 * Uses `spawn` instead of `execFile` so that arbitrary payloads can be sent
 * through stdin without shell-escaping concerns (eliminates code injection).
 */
export async function execDockerWithStdin(
    args: string[],
    stdin: string,
    options?: { timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
    const timeout = options?.timeout ?? 10_000;

    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                proc.kill('SIGKILL');
                reject(new Error(`execDockerWithStdin timed out after ${timeout}ms`));
            }
        }, timeout);

        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

        proc.on('error', (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
        });

        proc.on('close', (code) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                if (code !== 0) {
                    const err = new Error(`docker process exited with code ${code}: ${stderr}`);
                    (err as NodeJS.ErrnoException).code = String(code);
                    reject(err);
                } else {
                    resolve({ stdout, stderr });
                }
            }
        });

        // Write the payload and close stdin
        proc.stdin.write(stdin);
        proc.stdin.end();
    });
}
