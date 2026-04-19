import { createServer, type Server as HttpServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

import { authService } from '../authService.js';

import {
  DEPLOYMENT_WS_PATH,
  DeploymentWSServer
} from './deploymentWsServer.js';
import { attachWebSocketUpgradeRouter } from './upgradeRouter.js';

// Mocks are configured per-test via mockReturnValue / mockResolvedValue on the
// exported vi.fn references below. The default behaviour is a happy-path
// owner: deployment exists, user owns the project.

const mockGetById = vi.fn();
vi.mock('../../repositories/deploymentRepository.js', () => ({
  createDeploymentRepository: vi.fn(() => ({ getById: mockGetById }))
}));

const mockVerifyProjectOwnership = vi.fn();
vi.mock('../../middleware/resourceOwnership.js', () => ({
  verifyProjectOwnership: (...args: unknown[]) => mockVerifyProjectOwnership(...args)
}));

vi.mock('../../repositories/projectRepository.js', () => ({
  getProjectRepository: vi.fn(() => ({}))
}));

// Force the "DB configured" branch of authorizeAndSubscribe so the guards run.
vi.mock('../../db.js', () => ({
  hasDatabaseConfiguration: vi.fn(() => true)
}));

const TEST_TIMEOUT_MS = 1500;
const DEPLOYMENT_ID = 'deployment-alpha';
const OWNER_USER_ID = 'owner-user-id';
const OTHER_USER_ID = 'other-user-id';
const PROJECT_ID = 'project-owned-by-owner';

function makeToken(userId: string): string {
  return authService.generateAccessToken({
    user_id: userId,
    email: `${userId}@example.com`,
    role: 'user',
    email_verified: true,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString()
  });
}

async function listen(server: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('expected TCP address');
  return addr.port;
}

async function closeServer(server: HttpServer): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

async function connectAs(userId: string, port: number): Promise<WebSocket> {
  const token = makeToken(userId);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${DEPLOYMENT_WS_PATH}?token=${token}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return ws;
}

async function waitForMessage(ws: WebSocket, timeoutMs = TEST_TIMEOUT_MS): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for WS message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (e) {
        reject(e);
      }
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function expectNoMessage(ws: WebSocket, windowMs = 200): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      clearTimeout(timer);
      ws.off('message', onMsg);
      reject(new Error(`unexpected WS message: ${data.toString()}`));
    };
    ws.on('message', onMsg);
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      resolve();
    }, windowMs);
  });
}

describe('DeploymentWSServer authorization', () => {
  let server: HttpServer;
  let deploymentWss: DeploymentWSServer;
  let port: number;

  beforeEach(async () => {
    mockGetById.mockReset();
    mockVerifyProjectOwnership.mockReset();

    server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    deploymentWss = new DeploymentWSServer();
    attachWebSocketUpgradeRouter(server, [
      { path: DEPLOYMENT_WS_PATH, handleUpgrade: deploymentWss.handleUpgrade.bind(deploymentWss) }
    ]);
    port = await listen(server);
  });

  afterEach(async () => {
    deploymentWss.close();
    await closeServer(server);
  });

  it('subscribes when the connected user owns the deployment project', async () => {
    mockGetById.mockResolvedValue({ deploymentId: DEPLOYMENT_ID, projectId: PROJECT_ID });
    mockVerifyProjectOwnership.mockResolvedValue({ projectId: PROJECT_ID, userId: OWNER_USER_ID });

    const ws = await connectAs(OWNER_USER_ID, port);
    try {
      ws.send(JSON.stringify({ type: 'subscribe', deploymentId: DEPLOYMENT_ID }));
      // No snapshot fetcher is registered — broadcast is the only signal the
      // subscribe succeeded. Fire a broadcast and assert it arrives.
      await new Promise((r) => setTimeout(r, 50));
      deploymentWss.broadcastDeploymentEvent(DEPLOYMENT_ID, { type: 'deployment_status', deploymentId: DEPLOYMENT_ID, status: 'healthy' });
      const msg = await waitForMessage(ws);
      expect(msg).toMatchObject({ type: 'deployment_status', deploymentId: DEPLOYMENT_ID });
    } finally {
      ws.close();
    }
  });

  it('denies subscription when the user does NOT own the deployment project', async () => {
    mockGetById.mockResolvedValue({ deploymentId: DEPLOYMENT_ID, projectId: PROJECT_ID });
    mockVerifyProjectOwnership.mockImplementation(async (_projectId: string, userId: string) => {
      return userId === OWNER_USER_ID ? { projectId: PROJECT_ID, userId } : null;
    });

    const ws = await connectAs(OTHER_USER_ID, port);
    try {
      ws.send(JSON.stringify({ type: 'subscribe', deploymentId: DEPLOYMENT_ID }));
      const msg = await waitForMessage(ws);
      expect(msg).toMatchObject({
        type: 'error',
        message: expect.stringMatching(/Not authorized to subscribe/)
      });

      // Prove the subscription was not silently recorded: a broadcast must NOT
      // reach this unauthorized client.
      deploymentWss.broadcastDeploymentEvent(DEPLOYMENT_ID, { type: 'deployment_status', deploymentId: DEPLOYMENT_ID, status: 'healthy' });
      await expectNoMessage(ws);
    } finally {
      ws.close();
    }
  });

  it('returns an error frame when the deployment does not exist', async () => {
    mockGetById.mockResolvedValue(undefined);

    const ws = await connectAs(OWNER_USER_ID, port);
    try {
      ws.send(JSON.stringify({ type: 'subscribe', deploymentId: 'does-not-exist' }));
      const msg = await waitForMessage(ws);
      expect(msg).toMatchObject({
        type: 'error',
        message: expect.stringMatching(/Deployment not found/)
      });
    } finally {
      ws.close();
    }
  });
});

