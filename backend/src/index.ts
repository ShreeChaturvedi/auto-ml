import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config.js';
import { hasDatabaseConfiguration, verifyDatabaseConnection } from './db.js';
import { appLogger } from './logging/logger.js';
import { initializeContainerManager, destroyAllContainers } from './services/containerManager.js';
import { setDeploymentWSBroadcast, recoverDeployments, startHealthCheckLoop, destroyAllDeploymentContainers } from './services/deploymentManager.js';
import { setWebSocketBroadcast as setCellExecutionBroadcast } from './services/notebook/cellExecutionService.js';
import { setWebSocketBroadcast } from './services/notebook/notebookService.js';
import { initializeDeploymentWebSocket, broadcastDeploymentEvent, getDeploymentWSServer } from './services/websocket/deploymentWsServer.js';
import { initializeWebSocket, broadcastNotebookEvent } from './services/websocket/wsServer.js';

const app = createApp();

// Create HTTP server from Express app
const server = createServer(app);

// Initialize WebSocket server
const wsServer = initializeWebSocket(server);

// Wire up WebSocket broadcasts to notebook services
setWebSocketBroadcast(broadcastNotebookEvent);
setCellExecutionBroadcast(broadcastNotebookEvent);

// Deployment services (requires Postgres)
if (hasDatabaseConfiguration()) {
  initializeDeploymentWebSocket(server);
  setDeploymentWSBroadcast(broadcastDeploymentEvent);

  // Recover deployment state from DB and start health check loop
  recoverDeployments().then(() => {
    startHealthCheckLoop();
    appLogger.info('[server] Deployment services started');
  }).catch(err => {
    appLogger.error('[server] Failed to recover deployments', err);
  });
}

// Track if shutdown is in progress to prevent double-handling
let isShuttingDown = false;

/**
 * Graceful shutdown handler - cleans up containers before exit
 */
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  appLogger.info(`[server] ${signal} received, shutting down gracefully`);

  // Stop accepting new WebSocket connections
  wsServer.close();
  if (hasDatabaseConfiguration()) {
    getDeploymentWSServer()?.close();
  }

  // Destroy all active containers
  await destroyAllContainers();
  await destroyAllDeploymentContainers();

  // Close HTTP server
  server.close(() => {
    appLogger.info('[server] HTTP server closed');
    process.exit(0);
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
    server.listen(env.port, () => {
      appLogger.info(`Server listening on http://localhost:${env.port}`);
      appLogger.info(`WebSocket available on ws://localhost:${env.port}/ws/notebook`);
    });

    // Verify database connection (non-blocking, doesn't prevent startup)
    void verifyDatabaseConnection().catch((error) => {
      appLogger.error('[db] Failed to verify Postgres connection', error);
      process.exitCode = 1;
    });
  } catch (error) {
    appLogger.error('[server] Failed to start:', error);
    process.exit(1);
  }
})();
