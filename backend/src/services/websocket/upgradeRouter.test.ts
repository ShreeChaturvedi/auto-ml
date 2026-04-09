import { createServer, type Server as HttpServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { authService } from '../authService.js';

import {
  DEPLOYMENT_WS_PATH,
  DeploymentWSServer
} from './deploymentWsServer.js';
import { attachWebSocketUpgradeRouter } from './upgradeRouter.js';
import { NOTEBOOK_WS_PATH, NotebookWSServer } from './wsServer.js';

const TEST_TIMEOUT_MS = 1500;

async function listen(server: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP server address');
  }

  return address.port;
}

async function closeServer(server: HttpServer): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

const authToken = authService.generateAccessToken({
  user_id: 'ws-test-user',
  email: 'ws-test@example.com',
  role: 'user',
  email_verified: true,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString()
});

async function exchangeSingleMessage(
  port: number,
  path: string,
  message: unknown
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}?token=${authToken}`);
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Timed out waiting for websocket response on ${path}`));
    }, TEST_TIMEOUT_MS);

    ws.once('open', () => {
      ws.send(JSON.stringify(message));
    });

    ws.once('message', (data) => {
      clearTimeout(timeout);
      ws.close();
      resolve(JSON.parse(data.toString()));
    });

    ws.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

describe('attachWebSocketUpgradeRouter', () => {
  let server: HttpServer;
  let notebookWss: NotebookWSServer;
  let deploymentWss: DeploymentWSServer;
  let port: number;

  beforeEach(async () => {
    server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });

    notebookWss = new NotebookWSServer();
    deploymentWss = new DeploymentWSServer();

    attachWebSocketUpgradeRouter(server, [
      {
        path: NOTEBOOK_WS_PATH,
        handleUpgrade: notebookWss.handleUpgrade.bind(notebookWss)
      },
      {
        path: DEPLOYMENT_WS_PATH,
        handleUpgrade: deploymentWss.handleUpgrade.bind(deploymentWss)
      }
    ]);

    port = await listen(server);
  });

  afterEach(async () => {
    notebookWss.close();
    deploymentWss.close();
    await closeServer(server);
  });

  it('keeps notebook subscriptions stable when multiple websocket paths share one HTTP server', async () => {
    const result = await exchangeSingleMessage(port, NOTEBOOK_WS_PATH, {
      type: 'subscribe',
      notebookId: 'notebook-1'
    });

    expect(result).toEqual({
      type: 'subscribed',
      notebookId: 'notebook-1'
    });
  });

  it('routes deployment websocket upgrades without corrupting the connection', async () => {
    const result = await exchangeSingleMessage(port, DEPLOYMENT_WS_PATH, {
      type: 'ping'
    });

    expect(result).toEqual({ type: 'pong' });
  });
});
