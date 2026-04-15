import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { join } from 'node:path';
import process from 'node:process';

import { createContainerManager } from './containerManager.mjs';

const defaultDatabaseUrl = 'postgres://postgres:postgres@localhost:5433/automl';
const signalExitCodes = {
  SIGINT: 130,
  SIGTERM: 143
};

function log(message) {
  console.log(`[dev] ${message}`);
}

function warn(message) {
  console.warn(`[dev] ${message}`);
}

export function getRepoRoot() {
  return fileURLToPath(new URL('../../', import.meta.url));
}

function createPaths(repoRoot) {
  return {
    backendEnvPath: join(repoRoot, 'backend', '.env'),
    backendEnvExamplePath: join(repoRoot, 'backend', '.env.example')
  };
}

function upsertEnvValue(contents, key, value) {
  const lines = contents.split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    if (!line.startsWith(`${key}=`)) {
      return line;
    }
    found = true;
    const currentValue = line.slice(`${key}=`.length).trim();
    return currentValue ? line : `${key}=${value}`;
  });
  if (!found) {
    updated.push(`${key}=${value}`);
  }
  return updated.join('\n');
}

function stripOptionalQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readEnvValue(contents, key) {
  const prefix = `${key}=`;
  const lines = contents.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (!line.startsWith(prefix)) continue;
    return stripOptionalQuotes(line.slice(prefix.length));
  }
  return '';
}

export function parseDatabaseConfig(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const hostPort = parsed.port || '5433';
    const username = decodeURIComponent(parsed.username || 'postgres');
    const password = decodeURIComponent(parsed.password || 'postgres');
    const database = parsed.pathname.replace(/^\/+/, '') || 'automl';
    return {
      databaseUrl,
      hostPort,
      username,
      password,
      database,
      containerName: `automl-postgres-${hostPort}`
    };
  } catch {
    return {
      databaseUrl: defaultDatabaseUrl,
      hostPort: '5433',
      username: 'postgres',
      password: 'postgres',
      database: 'automl',
      containerName: 'automl-postgres-5433'
    };
  }
}

function createSocketPortChecker({ netModule, customIsPortInUse }) {
  return async function isPortInUse(port) {
    if (customIsPortInUse) {
      return customIsPortInUse(port);
    }

    return new Promise((resolve) => {
      const socket = new netModule.Socket();

      const markResult = (result) => {
        if (!socket.destroyed) {
          socket.destroy();
        }
        resolve(result);
      };

      socket.setTimeout(400);
      socket.once('connect', () => markResult(true));
      socket.once('timeout', () => markResult(false));
      socket.once('error', (error) => {
        if (error?.code === 'ECONNREFUSED' || error?.code === 'EHOSTUNREACH') {
          markResult(false);
          return;
        }
        markResult(true);
      });

      socket.connect(port, '127.0.0.1');
    });
  };
}

function createHealthChecker({ fetchFn, customIsBackendHealthy }) {
  return async function isBackendHealthy(port) {
    if (customIsBackendHealthy) {
      return customIsBackendHealthy(port);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);

    try {
      const response = await fetchFn(`http://127.0.0.1:${port}/api/health`, {
        signal: controller.signal
      });

      if (!response.ok) {
        return false;
      }

      const payload = await response.json().catch(() => null);
      return payload?.status === 'ok';
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };
}

function createShutdownCoordinator({
  acquisition,
  children,
  processRef,
  stopOwnedContainer
}) {
  let shuttingDown = false;

  return new Promise((resolve) => {
    const finalize = (exitCode) => {
      processRef.exitCode = exitCode;
      stopOwnedContainer(acquisition);
      resolve(exitCode);
    };

    const cleanupListeners = () => {
      processRef.off('SIGINT', onSigint);
      processRef.off('SIGTERM', onSigterm);
    };

    const shutdownAndResolve = async (signal, exitCode = 0) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      cleanupListeners();

      for (const child of children) {
        if (!child.killed) {
          child.kill(signal);
        }
      }

      finalize(exitCode);
    };

    const onSigint = () => {
      void shutdownAndResolve('SIGINT', signalExitCodes.SIGINT);
    };
    const onSigterm = () => {
      void shutdownAndResolve('SIGTERM', signalExitCodes.SIGTERM);
    };

    processRef.on('SIGINT', onSigint);
    processRef.on('SIGTERM', onSigterm);

    for (const child of children) {
      child.on('exit', (code) => {
        void shutdownAndResolve('SIGTERM', code ?? 0);
      });
      child.on('error', () => {
        void shutdownAndResolve('SIGTERM', 1);
      });
    }
  });
}

export function createDevRunner({
  repoRoot = getRepoRoot(),
  processRef = process,
  spawnFn = spawn,
  spawnSyncFn = spawnSync,
  existsSyncFn = existsSync,
  readFileSyncFn = readFileSync,
  writeFileSyncFn = writeFileSync,
  fetchFn = globalThis.fetch,
  netModule = net,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = log,
  warnLogger = warn,
  isPortInUse: customIsPortInUse,
  isBackendHealthy: customIsBackendHealthy
} = {}) {
  const paths = createPaths(repoRoot);
  const isPortInUse = createSocketPortChecker({ netModule, customIsPortInUse });
  const isBackendHealthy = createHealthChecker({ fetchFn, customIsBackendHealthy });
  const runCommand = (command, args, options = {}) => {
    const result = spawnSyncFn(command, args, { stdio: 'inherit', ...options });
    if (result.status !== 0) {
      throw new Error(`Command failed: ${command} ${args.join(' ')}`);
    }
    return result;
  };
  const { ensureDatabaseContainer, ensureSandboxNetwork, stopOwnedContainer } = createContainerManager({
    spawnSyncFn,
    logger,
    warnLogger
  });

  function ensureBackendEnv() {
    if (!existsSyncFn(paths.backendEnvPath)) {
      if (!existsSyncFn(paths.backendEnvExamplePath)) {
        throw new Error('backend/.env.example is missing. Cannot create backend/.env');
      }
      const template = readFileSyncFn(paths.backendEnvExamplePath, 'utf8');
      const existingDatabaseUrl = readEnvValue(template, 'DATABASE_URL');
      const databaseUrl = existingDatabaseUrl || defaultDatabaseUrl;
      const populated = upsertEnvValue(template, 'DATABASE_URL', databaseUrl);
      writeFileSyncFn(paths.backendEnvPath, populated, 'utf8');
      logger('Created backend/.env with default DATABASE_URL.');
      return parseDatabaseConfig(databaseUrl);
    }

    const current = readFileSyncFn(paths.backendEnvPath, 'utf8');
    const existingDatabaseUrl = readEnvValue(current, 'DATABASE_URL');
    const databaseUrl = existingDatabaseUrl || defaultDatabaseUrl;
    const updated = upsertEnvValue(current, 'DATABASE_URL', databaseUrl);
    if (updated !== current) {
      writeFileSyncFn(paths.backendEnvPath, updated, 'utf8');
      logger('Updated backend/.env with default DATABASE_URL.');
    }
    return parseDatabaseConfig(databaseUrl);
  }

  function readBackendPort() {
    if (!existsSyncFn(paths.backendEnvPath)) {
      return 4000;
    }

    const contents = readFileSyncFn(paths.backendEnvPath, 'utf8');
    const rawPort = readEnvValue(contents, 'PORT');
    const parsed = Number.parseInt(rawPort, 10);

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      return 4000;
    }

    return parsed;
  }

  function ensureBackendDependencies() {
    logger('Ensuring backend dependencies are installed.');
    runCommand('npm', ['--prefix', 'backend', 'install', '--no-audit', '--no-fund']);
  }

  async function runMigrationsWithRetry() {
    const maxAttempts = 8;
    let delayMs = 750;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        logger(`Running database migrations (attempt ${attempt}/${maxAttempts}).`);
        runCommand('npm', ['--prefix', 'backend', 'run', 'db:migrate']);
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        logger(`Migrations failed, retrying in ${delayMs}ms...`);
        await sleepFn(delayMs);
        delayMs = Math.min(Math.round(delayMs * 1.5), 5000);
      }
    }
  }

  async function startDevServers(acquisition) {
    logger('Starting backend and frontend dev servers.');

    const backendPort = readBackendPort();
    const portInUse = await isPortInUse(backendPort);

    let backend = null;
    if (portInUse) {
      const backendIsHealthy = await isBackendHealthy(backendPort);
      if (backendIsHealthy) {
        logger(`Backend already running on port ${backendPort}; reusing existing process.`);
      } else {
        throw new Error(
          `Port ${backendPort} is already in use by another process. ` +
            `Stop that process or change PORT in backend/.env before running npm run dev.`
        );
      }
    } else {
      backend = spawnFn('npm', ['--prefix', 'backend', 'run', 'dev'], { stdio: 'inherit' });
    }

    const frontend = spawnFn('npm', ['--prefix', 'frontend', 'run', 'dev:ui'], { stdio: 'inherit' });
    return createShutdownCoordinator({
      acquisition,
      children: [backend, frontend].filter(Boolean),
      processRef,
      stopOwnedContainer
    });
  }

  async function run() {
    let acquisition = null;

    try {
      const dbConfig = ensureBackendEnv();
      ensureBackendDependencies();
      acquisition = ensureDatabaseContainer(dbConfig);
      ensureSandboxNetwork();
      await runMigrationsWithRetry();
      return await startDevServers(acquisition);
    } catch (error) {
      stopOwnedContainer(acquisition);
      throw error;
    }
  }

  return {
    ensureBackendEnv,
    ensureDatabaseContainer,
    ensureSandboxNetwork,
    readBackendPort,
    run,
    runMigrationsWithRetry,
    startDevServers,
    stopOwnedContainer
  };
}
