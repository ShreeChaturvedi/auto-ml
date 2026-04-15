import { beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../config.js';

const {
  mockCallTool,
  mockClientConnect,
  mockClientClose,
  mockServerConnect,
  mockServerClose,
  mockCreateLinkedPair
} = vi.hoisted(() => ({
  mockCallTool: vi.fn(),
  mockClientConnect: vi.fn(),
  mockClientClose: vi.fn(),
  mockServerConnect: vi.fn(),
  mockServerClose: vi.fn(),
  mockCreateLinkedPair: vi.fn(() => [{ id: 'client-transport' }, { id: 'server-transport' }])
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = mockClientConnect;
    close = mockClientClose;
    callTool = mockCallTool;
  }
}));

vi.mock('@modelcontextprotocol/sdk/inMemory.js', () => ({
  InMemoryTransport: {
    createLinkedPair: mockCreateLinkedPair
  }
}));

vi.mock('./mcpServer.js', () => ({
  createMcpServer: vi.fn(() => ({
    connect: mockServerConnect,
    close: mockServerClose
  }))
}));

const { executeMcpTool } = await import('./mcpAdapter.js');

describe('executeMcpTool', () => {
  beforeEach(() => {
    mockCallTool.mockReset();
    mockClientConnect.mockReset();
    mockClientClose.mockReset();
    mockServerConnect.mockReset();
    mockServerClose.mockReset();

    mockCallTool.mockResolvedValue({
      isError: false,
      structuredContent: { status: 'success' }
    });
    mockClientConnect.mockResolvedValue(undefined);
    mockClientClose.mockResolvedValue(undefined);
    mockServerConnect.mockResolvedValue(undefined);
    mockServerClose.mockResolvedValue(undefined);
  });

  it('extends MCP timeout for run_cell to match notebook execution budget', async () => {
    await executeMcpTool('project-1', 'run_cell', {
      notebookId: 'nb-1',
      cellId: 'cell-1'
    });

    expect(mockCallTool).toHaveBeenCalledWith(
      {
        name: 'run_cell',
        arguments: {
          projectId: 'project-1',
          notebookId: 'nb-1',
          cellId: 'cell-1'
        }
      },
      undefined,
      { timeout: env.executionTimeoutMs + 10_000 }
    );
  });

  it('keeps default MCP timeout behavior for non-run_cell tools', async () => {
    await executeMcpTool('project-1', 'list_cells', {
      notebookId: 'nb-1'
    });

    expect(mockCallTool).toHaveBeenCalledWith(
      {
        name: 'list_cells',
        arguments: {
          projectId: 'project-1',
          notebookId: 'nb-1'
        }
      },
      undefined,
      undefined
    );
  });
});
