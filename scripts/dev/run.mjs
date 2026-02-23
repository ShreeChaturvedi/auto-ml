#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const backendEnvPath = join(root, 'backend', '.env');
const backendEnvExamplePath = join(root, 'backend', '.env.example');
const defaultDatabaseUrl = 'postgres://postgres:automl@localhost:5433/automl';
const containerName = 'automl-postgres-5433';
const postgresImage = 'postgres:16';

function log(message) {
  console.log(`[dev] ${message}`);
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

function ensureBackendEnv() {
  if (!existsSync(backendEnvPath)) {
    if (!existsSync(backendEnvExamplePath)) {
      throw new Error('backend/.env.example is missing. Cannot create backend/.env');
    }
    const template = readFileSync(backendEnvExamplePath, 'utf8');
    const populated = upsertEnvValue(template, 'DATABASE_URL', defaultDatabaseUrl);
    writeFileSync(backendEnvPath, populated, 'utf8');
    log('Created backend/.env with default DATABASE_URL.');
    return;
  }

  const current = readFileSync(backendEnvPath, 'utf8');
  const updated = upsertEnvValue(current, 'DATABASE_URL', defaultDatabaseUrl);
  if (updated !== current) {
    writeFileSync(backendEnvPath, updated, 'utf8');
    log('Updated backend/.env with default DATABASE_URL.');
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function isDockerAvailable() {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return result.status === 0;
}

function listContainerNames({ all = false } = {}) {
  const args = ['ps', '--format', '{{.Names}}'];
  if (all) {
    args.splice(1, 0, '-a');
  }
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function ensureDatabaseContainer() {
  if (!isDockerAvailable()) {
    throw new Error('Docker is not available. Start Docker Desktop and rerun npm run dev.');
  }

  const allContainers = listContainerNames({ all: true });
  const runningContainers = listContainerNames({ all: false });

  if (runningContainers.includes(containerName)) {
    log(`Postgres container "${containerName}" is already running.`);
    return;
  }

  if (allContainers.includes(containerName)) {
    log(`Starting existing Postgres container "${containerName}".`);
    runCommand('docker', ['start', containerName]);
    return;
  }

  log(`Creating Postgres container "${containerName}" on port 5433.`);
  runCommand('docker', [
    'run',
    '--name',
    containerName,
    '-e',
    'POSTGRES_PASSWORD=automl',
    '-e',
    'POSTGRES_DB=automl',
    '-p',
    '5433:5432',
    '-d',
    postgresImage
  ]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runMigrationsWithRetry() {
  const maxAttempts = 8;
  let delayMs = 750;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      log(`Running database migrations (attempt ${attempt}/${maxAttempts}).`);
      runCommand('npm', ['--prefix', 'backend', 'run', 'db:migrate']);
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      log(`Migrations failed, retrying in ${delayMs}ms...`);
      await sleep(delayMs);
      delayMs = Math.min(Math.round(delayMs * 1.5), 5000);
    }
  }
}

function startDevServers() {
  log('Starting backend and frontend dev servers.');

  const backend = spawn('npm', ['--prefix', 'backend', 'run', 'dev'], { stdio: 'inherit' });
  // Frontend `dev` can include backend in some branches; use `dev:ui` to avoid double-starting backend here.
  const frontend = spawn('npm', ['--prefix', 'frontend', 'run', 'dev:ui'], { stdio: 'inherit' });

  const shutdown = (signal) => {
    if (!backend.killed) {
      backend.kill(signal);
    }
    if (!frontend.killed) {
      frontend.kill(signal);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  backend.on('exit', (code) => {
    shutdown('SIGTERM');
    process.exit(code ?? 0);
  });

  frontend.on('exit', (code) => {
    shutdown('SIGTERM');
    process.exit(code ?? 0);
  });
}

async function main() {
  ensureBackendEnv();
  ensureDatabaseContainer();
  await runMigrationsWithRetry();
  startDevServers();
}

main().catch((error) => {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
