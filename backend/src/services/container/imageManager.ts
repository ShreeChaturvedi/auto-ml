/**
 * Image Manager
 *
 * Handles Docker image resolution, availability checks, and automatic
 * runtime image building for sandboxed Python execution containers.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../../config.js';
import { appLogger } from '../../logging/logger.js';
import type { PythonVersion } from '../../types/execution.js';
import { execDocker } from '../dockerUtils.js';

const DOCKERFILE_HASH_LABEL = 'automl.dockerfile.hash';

function resolveRuntimeDockerfilePath(): string {
    const candidates = [
        resolve(process.cwd(), 'docker', 'Dockerfile.python-runtime'),
        resolve(process.cwd(), 'backend', 'docker', 'Dockerfile.python-runtime'),
        fileURLToPath(new URL('../../docker/Dockerfile.python-runtime', import.meta.url))
    ];

    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const runtimeDockerfilePath = resolveRuntimeDockerfilePath();
const runtimeDockerContext = resolve(dirname(runtimeDockerfilePath));

/** In-flight image build promises, keyed by image name to avoid duplicate builds. */
const imageBuilds = new Map<string, Promise<void>>();

/**
 * Get Docker image name for Python version
 */
export function getImageName(pythonVersion: PythonVersion): string {
    const image = env.dockerImage;
    if (image.includes('{pythonVersion}')) {
        return image.replace('{pythonVersion}', pythonVersion);
    }

    if (image.includes(':')) {
        const [repo, tag] = image.split(':');
        if (tag === 'latest') {
            return `${repo}:${pythonVersion}`;
        }
        return image;
    }

    return `${image}:${pythonVersion}`;
}

export function getLatestTag(imageName: string): string | null {
    if (!imageName.includes(':')) return null;
    const [repo, tag] = imageName.split(':');
    if (tag === 'latest') return imageName;
    return `${repo}:latest`;
}

export async function isImageAvailable(imageName: string): Promise<boolean> {
    try {
        await execDocker(['image', 'inspect', imageName]);
        return true;
    } catch {
        return false;
    }
}

/** SHA-256 hash of the Dockerfile content, used to detect stale images. */
export async function computeDockerfileHash(dockerfilePath: string): Promise<string> {
    const content = await readFile(dockerfilePath, 'utf8');
    return createHash('sha256').update(content).digest('hex');
}

/**
 * Read the `automl.dockerfile.hash` label from an existing Docker image.
 * Returns `null` if the image has no such label or the inspect fails.
 */
export async function getImageDockerfileHash(imageName: string): Promise<string | null> {
    try {
        const { stdout } = await execDocker([
            'image', 'inspect',
            '--format', `{{index .Config.Labels "${DOCKERFILE_HASH_LABEL}"}}`,
            imageName,
        ]);
        const hash = stdout.trim();
        // Docker outputs "<no value>" when label is missing
        return hash && hash !== '<no value>' ? hash : null;
    } catch {
        return null;
    }
}

export async function ensureRuntimeImage(pythonVersion: PythonVersion): Promise<string> {
    const imageName = getImageName(pythonVersion);
    const available = await isImageAvailable(imageName);
    let dockerfileHash: string | undefined;

    if (available) {
        const [currentHash, imageHash] = await Promise.all([
            computeDockerfileHash(runtimeDockerfilePath),
            getImageDockerfileHash(imageName),
        ]);
        dockerfileHash = currentHash;

        if (imageHash === currentHash) {
            return imageName;
        }

        appLogger.info(
            `[containerManager] Stale image detected for ${imageName} ` +
            `(image hash: ${imageHash ?? 'none'}, dockerfile hash: ${currentHash}). Rebuilding.`
        );
    }

    if (!env.executionAutoBuildImage) {
        throw new Error(`Docker image "${imageName}" is missing or stale. Build it with backend/docker/build-runtime.sh.`);
    }

    const existingBuild = imageBuilds.get(imageName);
    if (existingBuild) {
        await existingBuild;
        return imageName;
    }

    const buildPromise = (async () => {
        const tags = new Set<string>([imageName]);
        const latestTag = getLatestTag(imageName);
        if (latestTag) {
            tags.add(latestTag);
        }

        dockerfileHash ??= await computeDockerfileHash(runtimeDockerfilePath);

        appLogger.info(`[containerManager] Building runtime image: ${imageName}`);
        const buildArgs = [
            'build',
            '--build-arg', `PYTHON_VERSION=${pythonVersion}`,
            '--label', `${DOCKERFILE_HASH_LABEL}=${dockerfileHash}`,
        ];
        if (env.executionDockerPlatform) {
            buildArgs.push('--platform', env.executionDockerPlatform);
        }
        Array.from(tags).forEach((tag) => {
            buildArgs.push('-t', tag);
        });
        buildArgs.push('-f', runtimeDockerfilePath, runtimeDockerContext);
        await execDocker(buildArgs);
    })();

    imageBuilds.set(imageName, buildPromise);

    try {
        await buildPromise;
    } finally {
        imageBuilds.delete(imageName);
    }

    return imageName;
}
