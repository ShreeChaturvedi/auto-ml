import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config.js';
import { verifyDatabaseConnection } from './db.js';
import { initializeWebSocket, broadcastNotebookEvent } from './services/websocket/wsServer.js';
import { setWebSocketBroadcast } from './services/notebook/notebookService.js';
import { setWebSocketBroadcast as setCellExecutionBroadcast } from './services/notebook/cellExecutionService.js';
import { initializeContainerManager, destroyAllContainers } from './services/containerManager.js';

const app = createApp();

// Create HTTP server from Express app
const server = createServer(app);

// Initialize WebSocket server
const wsServer = initializeWebSocket(server);

// Wire up WebSocket broadcasts to notebook services
setWebSocketBroadcast(broadcastNotebookEvent);
setCellExecutionBroadcast(broadcastNotebookEvent);

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

  console.log(`[server] ${signal} received, shutting down gracefully`);

  // Stop accepting new WebSocket connections
  wsServer.close();

  // Destroy all active containers
  await destroyAllContainers();

  // Close HTTP server
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds if shutdown hangs
  setTimeout(() => {
    console.log('[server] Forced exit after timeout');
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
      console.log(`Server listening on http://localhost:${env.port}`);
      console.log(`WebSocket available on ws://localhost:${env.port}/ws/notebook`);
    });

    // Verify database connection (non-blocking, doesn't prevent startup)
    void verifyDatabaseConnection().catch((error) => {
      console.error('[db] Failed to verify Postgres connection', error);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error('[server] Failed to start:', error);
    process.exit(1);
  }
})();
