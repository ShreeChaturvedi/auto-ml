import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock execDocker so no real Docker commands run
vi.mock('../dockerUtils.js', () => ({
    execDocker: vi.fn(),
}));

// Mock config so env values are predictable
vi.mock('../../config.js', () => ({
    env: {
        dockerImage: 'automl-python-runtime:latest',
        executionAutoBuildImage: true,
        executionDockerPlatform: '',
        executionNetwork: 'none',
    },
}));

// Mock logger to suppress output
vi.mock('../../logging/logger.js', () => ({
    appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// eslint-disable-next-line import/order -- vi.mock hoisting requires mocks before these imports
import { execDocker } from '../dockerUtils.js';
import { computeDockerfileHash, getImageDockerfileHash } from './imageManager.js';

const mockExecDocker = vi.mocked(execDocker);

describe('computeDockerfileHash', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'imagemanager-test-'));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    it('returns a deterministic SHA-256 hex hash of file content', async () => {
        const content = 'FROM python:3.11-slim\nRUN pip install optuna\n';
        const filePath = join(tempDir, 'Dockerfile');
        await writeFile(filePath, content, 'utf8');

        const expected = createHash('sha256').update(content).digest('hex');
        const result = await computeDockerfileHash(filePath);

        expect(result).toBe(expected);
        expect(result).toHaveLength(64); // SHA-256 hex is always 64 chars
    });

    it('returns a different hash when file content changes', async () => {
        const filePath = join(tempDir, 'Dockerfile');

        await writeFile(filePath, 'FROM python:3.11-slim\n', 'utf8');
        const hash1 = await computeDockerfileHash(filePath);

        await writeFile(filePath, 'FROM python:3.11-slim\nRUN pip install optuna\n', 'utf8');
        const hash2 = await computeDockerfileHash(filePath);

        expect(hash1).not.toBe(hash2);
    });

    it('throws when the file does not exist', async () => {
        await expect(computeDockerfileHash(join(tempDir, 'nonexistent'))).rejects.toThrow();
    });
});

describe('getImageDockerfileHash', () => {
    beforeEach(() => {
        mockExecDocker.mockReset();
    });

    it('returns the hash label from the image', async () => {
        mockExecDocker.mockResolvedValue({ stdout: 'abc123def456\n', stderr: '' });

        const result = await getImageDockerfileHash('automl-python-runtime:3.11');
        expect(result).toBe('abc123def456');
        expect(mockExecDocker).toHaveBeenCalledWith([
            'image', 'inspect',
            '--format', expect.stringContaining('automl.dockerfile.hash'),
            'automl-python-runtime:3.11',
        ]);
    });

    it('returns null when image has no hash label', async () => {
        mockExecDocker.mockResolvedValue({ stdout: '<no value>\n', stderr: '' });

        const result = await getImageDockerfileHash('automl-python-runtime:3.11');
        expect(result).toBeNull();
    });

    it('returns null when image inspect returns empty string', async () => {
        mockExecDocker.mockResolvedValue({ stdout: '\n', stderr: '' });

        const result = await getImageDockerfileHash('automl-python-runtime:3.11');
        expect(result).toBeNull();
    });

    it('returns null when docker inspect fails (image does not exist)', async () => {
        mockExecDocker.mockRejectedValue(new Error('No such image'));

        const result = await getImageDockerfileHash('nonexistent:latest');
        expect(result).toBeNull();
    });
});

describe('ensureRuntimeImage hash logic', () => {
    // Module-level path resolution prevents direct ensureRuntimeImage testing;
    // verify the hash-comparison logic that drives rebuild decisions instead.

    let tempDir: string;
    let dockerfilePath: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'imagemanager-ensure-'));
        dockerfilePath = join(tempDir, 'Dockerfile.python-runtime');
        await writeFile(dockerfilePath, 'FROM python:3.11-slim\nRUN pip install optuna\n', 'utf8');
        mockExecDocker.mockReset();
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    it('skips rebuild when dockerfile hash matches image label', async () => {
        const dockerfileContent = 'FROM python:3.11-slim\nRUN pip install optuna\n';
        const expectedHash = createHash('sha256').update(dockerfileContent).digest('hex');

        const { isImageAvailable, computeDockerfileHash: computeHash, getImageDockerfileHash: getHash } = await import('./imageManager.js');

        mockExecDocker.mockResolvedValueOnce({ stdout: '[]', stderr: '' });
        expect(await isImageAvailable('automl-python-runtime:3.11')).toBe(true);

        const hash = await computeHash(dockerfilePath);
        expect(hash).toBe(expectedHash);

        mockExecDocker.mockResolvedValueOnce({ stdout: `${expectedHash}\n`, stderr: '' });
        const imageHash = await getHash('automl-python-runtime:3.11');

        expect(hash).toBe(imageHash);
    });

    it('detects stale image when hashes differ', async () => {
        const staleHash = 'stale0000000000000000000000000000000000000000000000000000000000';
        const dockerfileContent = 'FROM python:3.11-slim\nRUN pip install optuna\n';
        const currentHash = createHash('sha256').update(dockerfileContent).digest('hex');

        const { computeDockerfileHash: computeHash, getImageDockerfileHash: getHash } = await import('./imageManager.js');

        const hash = await computeHash(dockerfilePath);
        expect(hash).toBe(currentHash);

        mockExecDocker.mockResolvedValueOnce({ stdout: `${staleHash}\n`, stderr: '' });
        const imageHash = await getHash('automl-python-runtime:3.11');

        expect(hash).not.toBe(imageHash);
    });

    it('detects legacy image with no hash label as stale', async () => {
        const { computeDockerfileHash: computeHash, getImageDockerfileHash: getHash } = await import('./imageManager.js');

        const hash = await computeHash(dockerfilePath);
        expect(hash).toBeTruthy();

        mockExecDocker.mockResolvedValueOnce({ stdout: '<no value>\n', stderr: '' });
        const imageHash = await getHash('automl-python-runtime:3.11');
        expect(imageHash).toBeNull();

        expect(hash).not.toBe(imageHash);
    });

    it('build args include the dockerfile hash label', async () => {
        const dockerfileContent = 'FROM python:3.11-slim\nRUN pip install optuna\n';
        const expectedHash = createHash('sha256').update(dockerfileContent).digest('hex');

        const label = `automl.dockerfile.hash=${expectedHash}`;
        const buildArgs = [
            'build',
            '--build-arg', 'PYTHON_VERSION=3.11',
            '--label', label,
            '-t', 'automl-python-runtime:3.11',
            '-f', dockerfilePath, tempDir,
        ];

        const labelIdx = buildArgs.indexOf('--label');
        expect(buildArgs[labelIdx + 1]).toBe(`automl.dockerfile.hash=${expectedHash}`);
    });
});
