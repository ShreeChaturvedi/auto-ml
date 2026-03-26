import os from 'node:os';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import type { PythonVersion } from '../types/execution.js';
import { getErrorMessage } from '../utils/errors.js';

import { getImageName, isImageAvailable } from './container/imageManager.js';
import { execDocker } from './dockerUtils.js';

const DEFAULT_CHECK_TIMEOUT_MS = 1_500;
const DEFAULT_RUNTIME_PYTHON_VERSION: PythonVersion = '3.11';

export type HealthStatus = 'ok' | 'degraded' | 'error';

interface BaseHealthCheck {
  status: HealthStatus;
  critical: boolean;
}

export interface DatabaseHealthCheck extends BaseHealthCheck {
  configured: boolean;
  latencyMs: number | null;
  message?: string;
}

export interface DockerHealthCheck extends BaseHealthCheck {
  enabled: boolean;
  reachable: boolean;
  latencyMs: number | null;
  message?: string;
}

export interface RuntimeImageHealthCheck extends BaseHealthCheck {
  enabled: boolean;
  image: string;
  available: boolean;
  message?: string;
}

export interface MemoryHealthCheck extends BaseHealthCheck {
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
}

export interface HealthReport {
  status: HealthStatus;
  uptime: number;
  timestamp: string;
  host: string;
  checks: {
    database: DatabaseHealthCheck;
    docker: DockerHealthCheck;
    runtimeImage: RuntimeImageHealthCheck;
    memory: MemoryHealthCheck;
  };
}

interface HealthServiceDeps {
  getTimestamp: () => string;
  getUptime: () => number;
  getHost: () => string;
  getMemoryUsage: () => NodeJS.MemoryUsage;
  hasDatabaseConfiguration: () => boolean;
  queryDatabase: () => Promise<void>;
  dockerEnabled: boolean;
  pingDocker: () => Promise<void>;
  runtimePythonVersion: PythonVersion;
  checkRuntimeImage: (imageName: string) => Promise<boolean>;
}

const defaultDeps: HealthServiceDeps = {
  getTimestamp: () => new Date().toISOString(),
  getUptime: () => process.uptime(),
  getHost: () => os.hostname(),
  getMemoryUsage: () => process.memoryUsage(),
  hasDatabaseConfiguration,
  queryDatabase: async () => {
    await getDbPool().query('select 1 as ok');
  },
  dockerEnabled: env.dockerEnabled,
  pingDocker: async () => {
    await execDocker(['info'], { timeout: DEFAULT_CHECK_TIMEOUT_MS });
  },
  runtimePythonVersion: DEFAULT_RUNTIME_PYTHON_VERSION,
  checkRuntimeImage: isImageAvailable
};

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function getDatabaseCheck(deps: HealthServiceDeps): Promise<DatabaseHealthCheck> {
  if (!deps.hasDatabaseConfiguration()) {
    return {
      status: 'error',
      critical: true,
      configured: false,
      latencyMs: null,
      message: 'DATABASE_URL is not configured.'
    };
  }

  const startedAt = Date.now();
  try {
    await withTimeout(
      deps.queryDatabase(),
      DEFAULT_CHECK_TIMEOUT_MS,
      'Database connectivity check timed out.'
    );
    return {
      status: 'ok',
      critical: true,
      configured: true,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: 'error',
      critical: true,
      configured: true,
      latencyMs: Date.now() - startedAt,
      message: getErrorMessage(error, 'Database connectivity check failed.')
    };
  }
}

async function getDockerCheck(deps: HealthServiceDeps): Promise<DockerHealthCheck> {
  if (!deps.dockerEnabled) {
    return {
      status: 'degraded',
      critical: false,
      enabled: false,
      reachable: false,
      latencyMs: null,
      message: 'Docker checks are disabled by configuration.'
    };
  }

  const startedAt = Date.now();
  try {
    await withTimeout(
      deps.pingDocker(),
      DEFAULT_CHECK_TIMEOUT_MS,
      'Docker daemon check timed out.'
    );
    return {
      status: 'ok',
      critical: false,
      enabled: true,
      reachable: true,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: 'degraded',
      critical: false,
      enabled: true,
      reachable: false,
      latencyMs: Date.now() - startedAt,
      message: getErrorMessage(error, 'Docker daemon check failed.')
    };
  }
}

async function getRuntimeImageCheck(
  deps: HealthServiceDeps,
  dockerCheck: DockerHealthCheck
): Promise<RuntimeImageHealthCheck> {
  const imageName = getImageName(deps.runtimePythonVersion);

  if (!deps.dockerEnabled) {
    return {
      status: 'degraded',
      critical: false,
      enabled: false,
      image: imageName,
      available: false,
      message: 'Runtime image checks are disabled because Docker is disabled.'
    };
  }

  if (!dockerCheck.reachable) {
    return {
      status: 'degraded',
      critical: false,
      enabled: true,
      image: imageName,
      available: false,
      message: 'Runtime image could not be verified because Docker is unavailable.'
    };
  }

  try {
    const available = await withTimeout(
      deps.checkRuntimeImage(imageName),
      DEFAULT_CHECK_TIMEOUT_MS,
      'Runtime image check timed out.'
    );
    return {
      status: available ? 'ok' : 'degraded',
      critical: false,
      enabled: true,
      image: imageName,
      available,
      message: available ? undefined : `Runtime image "${imageName}" is missing locally.`
    };
  } catch (error) {
    return {
      status: 'degraded',
      critical: false,
      enabled: true,
      image: imageName,
      available: false,
      message: getErrorMessage(error, 'Runtime image check failed.')
    };
  }
}

function getMemoryCheck(deps: HealthServiceDeps): MemoryHealthCheck {
  const usage = deps.getMemoryUsage();
  return {
    status: 'ok',
    critical: false,
    rssBytes: usage.rss,
    heapTotalBytes: usage.heapTotal,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers
  };
}

function deriveOverallStatus(report: HealthReport['checks']): HealthStatus {
  const checks = Object.values(report);
  if (checks.some((check) => check.critical && check.status === 'error')) {
    return 'error';
  }
  if (checks.some((check) => check.status !== 'ok')) {
    return 'degraded';
  }
  return 'ok';
}

export async function getHealthReport(
  overrides: Partial<HealthServiceDeps> = {}
): Promise<HealthReport> {
  const deps: HealthServiceDeps = {
    ...defaultDeps,
    ...overrides
  };

  const [database, docker] = await Promise.all([
    getDatabaseCheck(deps),
    getDockerCheck(deps)
  ]);
  const runtimeImage = await getRuntimeImageCheck(deps, docker);
  const memory = getMemoryCheck(deps);

  const checks = {
    database,
    docker,
    runtimeImage,
    memory
  };

  return {
    status: deriveOverallStatus(checks),
    uptime: deps.getUptime(),
    timestamp: deps.getTimestamp(),
    host: deps.getHost(),
    checks
  };
}
