const postgresImage = 'pgvector/pgvector:pg16';

function createCommandRunner(spawnSyncFn) {
  return function runCommand(command, args, options = {}) {
    const result = spawnSyncFn(command, args, { stdio: 'inherit', ...options });
    if (result.status !== 0) {
      throw new Error(`Command failed: ${command} ${args.join(' ')}`);
    }
    return result;
  };
}

function createContainerMetadataReader(spawnSyncFn) {
  return function readContainerMetadata(containerName) {
    const result = spawnSyncFn('docker', ['inspect', containerName, '--format', '{{json .Config}}'], {
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      return {
        env: {},
        image: ''
      };
    }

    try {
      const config = JSON.parse(String(result.stdout ?? '').trim());
      const env = Array.isArray(config?.Env)
        ? config.Env.reduce((acc, line) => {
            const separator = line.indexOf('=');
            if (separator === -1) return acc;
            const key = line.slice(0, separator);
            const value = line.slice(separator + 1);
            acc[key] = value;
            return acc;
          }, {})
        : {};

      return {
        env,
        image: typeof config?.Image === 'string' ? config.Image.trim() : ''
      };
    } catch {
      return {
        env: {},
        image: ''
      };
    }
  };
}

export function createContainerManager({
  spawnSyncFn,
  logger,
  warnLogger
}) {
  const runCommand = createCommandRunner(spawnSyncFn);
  const readContainerMetadata = createContainerMetadataReader(spawnSyncFn);

  function isDockerAvailable() {
    const result = spawnSyncFn('docker', ['info'], { stdio: 'ignore' });
    return result.status === 0;
  }

  function listContainerNames({ all = false } = {}) {
    const args = ['ps', '--format', '{{.Names}}'];
    if (all) {
      args.splice(1, 0, '-a');
    }
    const result = spawnSyncFn('docker', args, { encoding: 'utf8' });
    if (result.status !== 0) {
      return [];
    }
    return String(result.stdout ?? '')
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function getContainerCompatibility(containerName, dbConfig) {
    const { env: containerEnv, image: containerImage } = readContainerMetadata(containerName);
    const currentPassword = containerEnv.POSTGRES_PASSWORD ?? '';
    const currentDb = containerEnv.POSTGRES_DB ?? 'postgres';
    const currentUser = containerEnv.POSTGRES_USER ?? 'postgres';
    const reasons = [];

    if (containerImage !== postgresImage) {
      reasons.push(`image mismatch: "${containerImage || 'unknown'}" vs required "${postgresImage}"`);
    }
    if (
      currentPassword !== dbConfig.password ||
      currentDb !== dbConfig.database ||
      currentUser !== dbConfig.username
    ) {
      reasons.push('credentials do not match backend/.env DATABASE_URL');
    }

    return {
      compatible: reasons.length === 0,
      reasons
    };
  }

  function ensureDatabaseContainer(dbConfig) {
    if (!isDockerAvailable()) {
      throw new Error('Docker is not available. Start Docker Desktop and rerun npm run dev.');
    }

    const { containerName, hostPort, username, password, database } = dbConfig;
    const allContainers = listContainerNames({ all: true });
    const runningContainers = listContainerNames({ all: false });
    let hasContainer = allContainers.includes(containerName);
    let isRunning = runningContainers.includes(containerName);

    if (hasContainer) {
      const { compatible, reasons } = getContainerCompatibility(containerName, dbConfig);
      if (!compatible) {
        if (isRunning) {
          throw new Error(
            `Managed Postgres container "${containerName}" is already running but ${reasons.join(' and ')}. ` +
              'Stop or remove it manually before rerunning npm run dev.'
          );
        }

        logger(`Container "${containerName}" will be recreated because ${reasons.join(' and ')}.`);
        runCommand('docker', ['rm', '-f', containerName]);
        hasContainer = false;
        isRunning = false;
      }
    }

    if (isRunning) {
      logger(`Postgres container "${containerName}" is already running.`);
      return { containerName, ownership: 'already-running' };
    }

    if (hasContainer) {
      logger(`Starting existing Postgres container "${containerName}".`);
      runCommand('docker', ['start', containerName]);
      return { containerName, ownership: 'started' };
    }

    logger(`Creating Postgres container "${containerName}" on port ${hostPort}.`);
    runCommand('docker', [
      'run',
      '--name',
      containerName,
      '-e',
      `POSTGRES_USER=${username}`,
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-e',
      `POSTGRES_DB=${database}`,
      '-p',
      `${hostPort}:5432`,
      '-d',
      postgresImage
    ]);
    return { containerName, ownership: 'created' };
  }

  function stopOwnedContainer(acquisition) {
    if (!acquisition || !['created', 'started'].includes(acquisition.ownership)) {
      return;
    }

    const runningContainers = listContainerNames({ all: false });
    if (!runningContainers.includes(acquisition.containerName)) {
      return;
    }

    const result = spawnSyncFn('docker', ['stop', acquisition.containerName], {
      encoding: 'utf8',
      timeout: 5000
    });
    if (result.status !== 0) {
      warnLogger(`Failed to stop Postgres container "${acquisition.containerName}" during shutdown.`);
    }
  }

  function ensureSandboxNetwork() {
    if (!isDockerAvailable()) return;
    const networkName = 'automl-sandbox';
    const inspect = spawnSyncFn('docker', ['network', 'inspect', networkName], { stdio: 'ignore' });
    if (inspect.status === 0) {
      logger(`Sandbox network "${networkName}" already exists.`);
      return;
    }
    logger(`Creating isolated sandbox network "${networkName}".`);
    runCommand('docker', ['network', 'create', '--internal', networkName]);
  }

  return {
    ensureDatabaseContainer,
    ensureSandboxNetwork,
    stopOwnedContainer
  };
}
