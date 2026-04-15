import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDevRunner } from '../../../scripts/dev/devRunner.mjs';

class FakeChildProcess extends EventEmitter {
  killed = false;
  receivedSignals: string[] = [];

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    if (typeof signal === 'string') {
      this.receivedSignals.push(signal);
    }
    return true;
  }
}

const defaultDbConfig = {
  containerName: 'automl-postgres-5433',
  hostPort: '5433',
  username: 'postgres',
  password: 'postgres',
  database: 'automl',
  databaseUrl: 'postgres://postgres:postgres@localhost:5433/automl'
};

function createContainerInspectOutput({
  image = 'pgvector/pgvector:pg16',
  user = 'postgres',
  password = 'postgres',
  database = 'automl'
} = {}) {
  return {
    status: 0,
    stdout: JSON.stringify({
      Image: image,
      Env: [`POSTGRES_USER=${user}`, `POSTGRES_PASSWORD=${password}`, `POSTGRES_DB=${database}`]
    })
  };
}

function createProcessHarness() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    exitCode: 0,
    on(event: string, listener: (...args: unknown[]) => void) {
      const current = listeners.get(event) ?? new Set();
      current.add(listener);
      listeners.set(event, current);
      return this;
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    }
  };
}

function createRunner({
  spawnSyncImpl,
  spawnImpl,
  isPortInUse = vi.fn().mockResolvedValue(false),
  isBackendHealthy = vi.fn().mockResolvedValue(false)
}: {
  spawnSyncImpl?: (command: string, args: string[], options?: Record<string, unknown>) => Record<string, unknown>;
  spawnImpl?: (command: string, args: string[], options?: Record<string, unknown>) => FakeChildProcess;
  isPortInUse?: ReturnType<typeof vi.fn>;
  isBackendHealthy?: ReturnType<typeof vi.fn>;
} = {}) {
  const processHarness = createProcessHarness();
  const spawnSync = vi.fn(
    spawnSyncImpl ??
      ((command: string, args: string[]) => {
        if (command === 'docker' && args[0] === 'info') return { status: 0 };
        if (command === 'docker' && args[0] === 'ps' && args[1] === '-a') {
          return { status: 0, stdout: '' };
        }
        if (command === 'docker' && args[0] === 'ps') {
          return { status: 0, stdout: '' };
        }
        if (command === 'docker' && args[0] === 'network') {
          return { status: 0 };
        }
        if (command === 'docker' && args[0] === 'run') {
          return { status: 0 };
        }
        if (command === 'npm') {
          return { status: 0 };
        }
        throw new Error(`Unhandled spawnSync: ${command} ${args.join(' ')}`);
      })
  );
  const spawn = vi.fn(
    spawnImpl ??
      (() => {
        return new FakeChildProcess();
      })
  );

  const runner = createDevRunner({
    repoRoot: '/repo',
    processRef: processHarness as never,
    spawnFn: spawn as never,
    spawnSyncFn: spawnSync as never,
    existsSyncFn: vi.fn((target: string) => target === '/repo/backend/.env'),
    readFileSyncFn: vi.fn((target: string) => {
      if (target === '/repo/backend/.env') {
        return 'DATABASE_URL=postgres://postgres:postgres@localhost:5433/automl\nPORT=4000\n';
      }
      if (target === '/repo/backend/.env.example') {
        return 'DATABASE_URL=\n';
      }
      throw new Error(`Unexpected read: ${target}`);
    }),
    writeFileSyncFn: vi.fn(),
    fetchFn: vi.fn(),
    netModule: {
      Socket: class {
        destroyed = false;
        setTimeout() {}
        once() {
          return this;
        }
        connect() {}
        destroy() {
          this.destroyed = true;
        }
      }
    } as never,
    sleepFn: vi.fn().mockResolvedValue(undefined),
    logger: vi.fn(),
    isPortInUse,
    isBackendHealthy
  });

  return { runner, spawnSync, spawn, processHarness, isPortInUse, isBackendHealthy };
}

describe('createDevRunner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns ownership metadata for an already-running compatible container', () => {
    const { runner } = createRunner({
      spawnSyncImpl: (command, args) => {
        if (command === 'docker' && args[0] === 'info') return { status: 0 };
        if (command === 'docker' && args[0] === 'ps' && args[1] === '-a') {
          return { status: 0, stdout: 'automl-postgres-5433\n' };
        }
        if (command === 'docker' && args[0] === 'ps') {
          return { status: 0, stdout: 'automl-postgres-5433\n' };
        }
        if (command === 'docker' && args[0] === 'inspect') {
          return createContainerInspectOutput();
        }
        throw new Error(`Unhandled spawnSync: ${command} ${args.join(' ')}`);
      }
    });

    expect(runner.ensureDatabaseContainer(defaultDbConfig)).toEqual({
      containerName: 'automl-postgres-5433',
      ownership: 'already-running'
    });
  });

  it('throws instead of recreating a running incompatible container', () => {
    const { runner } = createRunner({
      spawnSyncImpl: (command, args) => {
        if (command === 'docker' && args[0] === 'info') return { status: 0 };
        if (command === 'docker' && args[0] === 'ps' && args[1] === '-a') {
          return { status: 0, stdout: 'automl-postgres-5433\n' };
        }
        if (command === 'docker' && args[0] === 'ps') {
          return { status: 0, stdout: 'automl-postgres-5433\n' };
        }
        if (command === 'docker' && args[0] === 'inspect') {
          return createContainerInspectOutput({ image: 'postgres:16' });
        }
        throw new Error(`Unhandled spawnSync: ${command} ${args.join(' ')}`);
      }
    });

    expect(() => runner.ensureDatabaseContainer(defaultDbConfig)).toThrow(/already running/);
  });

  it('cleans up only owned containers when shutdown is triggered more than once', async () => {
    const backendChild = new FakeChildProcess();
    const frontendChild = new FakeChildProcess();
    const { runner, spawnSync, spawn, processHarness } = createRunner({
      spawnSyncImpl: (command, args) => {
        if (command === 'docker' && args[0] === 'ps' && args[1] === '--format') {
          return { status: 0, stdout: 'automl-postgres-5433\n' };
        }
        if (command === 'docker' && args[0] === 'stop') {
          return { status: 0, stdout: 'automl-postgres-5433\n' };
        }
        if (command === 'npm') {
          return { status: 0 };
        }
        throw new Error(`Unhandled spawnSync: ${command} ${args.join(' ')}`);
      },
      spawnImpl: (_command, args) => {
        if (args.includes('backend')) return backendChild;
        return frontendChild;
      }
    });

    const outcome = runner.startDevServers({
      containerName: 'automl-postgres-5433',
      ownership: 'created'
    });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));

    processHarness.emit('SIGINT', 'SIGINT');
    processHarness.emit('SIGTERM', 'SIGTERM');

    backendChild.emit('exit', 0);
    frontendChild.emit('exit', 0);

    const result = await outcome;

    expect(result).toBe(130);
    expect(backendChild.receivedSignals).toEqual(['SIGINT']);
    expect(frontendChild.receivedSignals).toEqual(['SIGINT']);
    expect(
      spawnSync.mock.calls.filter(
        ([command, args]) => command === 'docker' && Array.isArray(args) && args[0] === 'stop'
      )
    ).toHaveLength(1);
    expect(processHarness.listenerCount('SIGINT')).toBe(0);
    expect(processHarness.listenerCount('SIGTERM')).toBe(0);
  });

  it('does not signal an already-running healthy backend during shutdown', async () => {
    const frontendChild = new FakeChildProcess();
    const { runner, processHarness, spawn } = createRunner({
      spawnImpl: () => frontendChild,
      isPortInUse: vi.fn().mockResolvedValue(true),
      isBackendHealthy: vi.fn().mockResolvedValue(true)
    });

    const outcome = runner.startDevServers({
      containerName: 'automl-postgres-5433',
      ownership: 'already-running'
    });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));

    processHarness.emit('SIGINT', 'SIGINT');
    frontendChild.emit('exit', 0);

    const result = await outcome;

    expect(result).toBe(130);
    expect(frontendChild.receivedSignals).toEqual(['SIGINT']);
  });
});
