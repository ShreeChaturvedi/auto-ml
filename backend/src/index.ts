import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config.js';
import { hasDatabaseConfiguration, verifyDatabaseConnection } from './db.js';
import { appLogger } from './logging/logger.js';
import { initializeContainerManager, destroyAllContainers } from './services/containerManager.js';
import { setDeploymentWSBroadcast, recoverDeployments, startHealthCheckLoop } from './services/deploymentManager.js';
import { emailService } from './services/emailService.js';
import { setWebSocketBroadcast as setCellExecutionBroadcast } from './services/notebook/cellExecutionService.js';
import { setWebSocketBroadcast } from './services/notebook/notebookService.js';
import {
  DEPLOYMENT_WS_PATH,
  initializeDeploymentWebSocket,
  broadcastDeploymentEvent,
  getDeploymentWSServer
} from './services/websocket/deploymentWsServer.js';
import { attachWebSocketUpgradeRouter } from './services/websocket/upgradeRouter.js';
import { NOTEBOOK_WS_PATH, initializeWebSocket, broadcastNotebookEvent } from './services/websocket/wsServer.js';
import { handleStdinError } from './utils/stdinError.js';

let isShuttingDown = false;
let server: ReturnType<typeof createServer> | null = null;
let wsServer: ReturnType<typeof initializeWebSocket> | null = null;

if (process.stdin.isTTY === true) {
  process.stdin.once('error', (error) => {
    handleStdinError(error, process.stdin, () => {
      void shutdown('STDIN_ERROR', 1);
    });
  });
}

const app = createApp();

// Create HTTP server from Express app
server = createServer(app);

// Initialize WebSocket server
wsServer = initializeWebSocket();

// Wire up WebSocket broadcasts to notebook services
setWebSocketBroadcast(broadcastNotebookEvent);
setCellExecutionBroadcast(broadcastNotebookEvent);

const upgradeHandlers = [
  {
    path: NOTEBOOK_WS_PATH,
    handleUpgrade: wsServer.handleUpgrade.bind(wsServer)
  }
];

// Deployment services (requires Postgres)
if (hasDatabaseConfiguration()) {
  const deploymentWsServer = initializeDeploymentWebSocket();
  upgradeHandlers.push({
    path: DEPLOYMENT_WS_PATH,
    handleUpgrade: deploymentWsServer.handleUpgrade.bind(deploymentWsServer)
  });
  setDeploymentWSBroadcast(broadcastDeploymentEvent);

  // Recover deployment state from DB and start health check loop
  recoverDeployments().then(() => {
    startHealthCheckLoop();
    appLogger.info('[server] Deployment services started');
  }).catch(err => {
    appLogger.error('[server] Failed to recover deployments', err);
  });
}

attachWebSocketUpgradeRouter(server, upgradeHandlers);
/**
 * Graceful shutdown handler - cleans up containers before exit
 */
async function shutdown(signal: string, exitCode = 0): Promise<void> {
  const currentExitCode = typeof process.exitCode === 'number' ? process.exitCode : 0;
  process.exitCode = Math.max(currentExitCode, exitCode);

  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  appLogger.info(`[server] ${signal} received, shutting down gracefully`);

  // Stop accepting new WebSocket connections
  wsServer?.close();
  if (hasDatabaseConfiguration()) {
    getDeploymentWSServer()?.close();
  }

  // Destroy all active containers
  await destroyAllContainers();

  if (!server?.listening) {
    process.exit(process.exitCode ?? 0);
  }

  // Close HTTP server
  server.close(() => {
    appLogger.info('[server] HTTP server closed');
    process.exit(process.exitCode ?? 0);
  });

  // Force exit after 10 seconds if shutdown hangs
  setTimeout(() => {
    appLogger.info('[server] Forced exit after timeout');
    process.exit(1);
  }, 10000);
}

// Handle SIGTERM (Docker/systemd stop)
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => void shutdown('SIGINT'));

// Async startup
(async () => {
  try {
    // Initialize container manager - cleans up orphaned containers from previous runs
    await initializeContainerManager();

    // Start listening
    server!.listen(env.port, () => {
      appLogger.info(`Server listening on http://localhost:${env.port}`);
      appLogger.info(`WebSocket available on ws://localhost:${env.port}/ws/notebook`);
    });

    // Verify database connection (non-blocking, doesn't prevent startup)
    void verifyDatabaseConnection().catch((error) => {
      appLogger.error('[db] Failed to verify Postgres connection', error);
      process.exitCode = 1;
    });

    // Verify SMTP connection (non-blocking, doesn't prevent startup)
    if (emailService.isConfigured()) {
      void emailService.verifyConnection().then((ok) => {
        if (!ok) {
          appLogger.warn('[startup] SMTP connection check failed — check credentials');
        }
      });
    }
  } catch (error) {
    appLogger.error('[server] Failed to start:', error);
    process.exit(1);
  }
})();
