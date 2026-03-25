import { describe, expect, it } from 'vitest';

import { buildDockerRunArgs } from './dockerBuilder.js';
import { env } from '../../config.js';

describe('buildDockerRunArgs', () => {
    const baseParams = {
        containerName: 'test-container',
        imageName: 'automl-python-runtime:latest',
        workspacePath: '/tmp/workspace',
    };

    it('passes the configured execution network to isolate the sandbox', () => {
        const args = buildDockerRunArgs(baseParams);
        const networkIdx = args.indexOf('--network');
        expect(networkIdx).toBeGreaterThan(-1);
        expect(args[networkIdx + 1]).toBe(env.executionNetwork);
    });

    it('includes --add-host to block host.docker.internal SSRF', () => {
        const args = buildDockerRunArgs(baseParams);
        const addHostIdx = args.indexOf('--add-host');
        expect(addHostIdx).toBeGreaterThan(-1);
        expect(args[addHostIdx + 1]).toBe('host.docker.internal:0.0.0.0');
    });

    it('preserves existing security flags (read-only, memory, cpu limits)', () => {
        const args = buildDockerRunArgs(baseParams);
        expect(args).toContain('--read-only');
        expect(args).toContain('--memory');
        expect(args).toContain('--cpus');
        expect(args).toContain('--user');
    });
});
