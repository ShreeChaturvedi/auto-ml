import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { executeToolCall } from '../llm/tools.js';
import { LLM_TOOL_DEFINITIONS } from '../llm/toolRegistry.js';
import type { ToolCall, ToolResult } from '../../types/llm.js';

const toolDescriptions = new Map(LLM_TOOL_DEFINITIONS.map((tool) => [tool.name, tool.description]));

const projectIdSchema = z.string().min(1).describe('Project ID');

function toolDescription(name: ToolCall['tool']) {
  return toolDescriptions.get(name) ?? 'MCP tool';
}

function toMcpResult(result: ToolResult) {
  const payload = result.error ? { error: result.error } : result.output;
  const text =
    typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, null, 2) ?? String(payload);
  const structuredContent: Record<string, unknown> =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : { output: payload ?? null };

  return {
    content: [{ type: 'text' as const, text }],
    structuredContent,
    isError: Boolean(result.error)
  };
}

async function runTool(projectId: string, tool: ToolCall['tool'], args?: ToolCall['args']) {
  return executeToolCall(projectId, {
    id: randomUUID(),
    tool,
    args
  });
}

export function createMcpServer() {
  const server = new McpServer({
    name: 'automl-toolchain',
    version: '1.0.0'
  });

  server.registerTool(
    'list_project_files',
    {
      description: toolDescription('list_project_files'),
      inputSchema: {
        projectId: projectIdSchema
      }
    },
    async ({ projectId }) => toMcpResult(await runTool(projectId, 'list_project_files'))
  );

  server.registerTool(
    'get_dataset_profile',
    {
      description: toolDescription('get_dataset_profile'),
      inputSchema: {
        projectId: projectIdSchema,
        datasetId: z.string().min(1).describe('Dataset ID')
      }
    },
    async ({ projectId, datasetId }) =>
      toMcpResult(await runTool(projectId, 'get_dataset_profile', { datasetId }))
  );

  server.registerTool(
    'get_dataset_sample',
    {
      description: toolDescription('get_dataset_sample'),
      inputSchema: {
        projectId: projectIdSchema,
        datasetId: z.string().min(1).describe('Dataset ID')
      }
    },
    async ({ projectId, datasetId }) =>
      toMcpResult(await runTool(projectId, 'get_dataset_sample', { datasetId }))
  );

  server.registerTool(
    'search_documents',
    {
      description: toolDescription('search_documents'),
      inputSchema: {
        projectId: projectIdSchema,
        query: z.string().min(1).describe('Search query'),
        limit: z.number().optional().describe('Maximum number of snippets')
      }
    },
    async ({ projectId, query, limit }) =>
      toMcpResult(await runTool(projectId, 'search_documents', { query, limit }))
  );

  // ============================================================
  // Notebook Cell Tools
  // ============================================================

  server.registerTool(
    'list_cells',
    {
      description: toolDescription('list_cells'),
      inputSchema: {
        projectId: projectIdSchema
      }
    },
    async ({ projectId }) => toMcpResult(await runTool(projectId, 'list_cells'))
  );

  server.registerTool(
    'read_cell',
    {
      description: toolDescription('read_cell'),
      inputSchema: {
        projectId: projectIdSchema,
        cellId: z.string().min(1).describe('Cell ID')
      }
    },
    async ({ projectId, cellId }) =>
      toMcpResult(await runTool(projectId, 'read_cell', { cellId }))
  );

  server.registerTool(
    'write_cell',
    {
      description: toolDescription('write_cell'),
      inputSchema: {
        projectId: projectIdSchema,
        cellId: z.string().optional().describe('Cell ID (optional, for updating existing cell)'),
        title: z.string().optional().describe('Cell title'),
        content: z.string().min(1).describe('Cell content (Python code or markdown)'),
        cellType: z.enum(['code', 'markdown']).optional().describe('Cell type')
      }
    },
    async ({ projectId, cellId, title, content, cellType }) =>
      toMcpResult(await runTool(projectId, 'write_cell', { cellId, title, content, cellType }))
  );

  server.registerTool(
    'edit_cell',
    {
      description: toolDescription('edit_cell'),
      inputSchema: {
        projectId: projectIdSchema,
        cellId: z.string().min(1).describe('Cell ID'),
        startLine: z.number().min(1).describe('Start line (1-indexed)'),
        endLine: z.number().min(1).describe('End line (1-indexed, inclusive)'),
        newContent: z.string().describe('New content to replace the lines')
      }
    },
    async ({ projectId, cellId, startLine, endLine, newContent }) =>
      toMcpResult(await runTool(projectId, 'edit_cell', { cellId, startLine, endLine, newContent }))
  );

  server.registerTool(
    'run_cell',
    {
      description: toolDescription('run_cell'),
      inputSchema: {
        projectId: projectIdSchema,
        cellId: z.string().min(1).describe('Cell ID to execute')
      }
    },
    async ({ projectId, cellId }) =>
      toMcpResult(await runTool(projectId, 'run_cell', { cellId }))
  );

  server.registerTool(
    'delete_cell',
    {
      description: toolDescription('delete_cell'),
      inputSchema: {
        projectId: projectIdSchema,
        cellId: z.string().min(1).describe('Cell ID to delete')
      }
    },
    async ({ projectId, cellId }) =>
      toMcpResult(await runTool(projectId, 'delete_cell', { cellId }))
  );

  server.registerTool(
    'reorder_cells',
    {
      description: toolDescription('reorder_cells'),
      inputSchema: {
        projectId: projectIdSchema,
        cellIds: z.array(z.string()).min(1).describe('Cell IDs in desired order')
      }
    },
    async ({ projectId, cellIds }) =>
      toMcpResult(await runTool(projectId, 'reorder_cells', { cellIds }))
  );

  server.registerTool(
    'insert_cell',
    {
      description: toolDescription('insert_cell'),
      inputSchema: {
        projectId: projectIdSchema,
        position: z.number().min(0).describe('Position to insert cell (0-indexed)'),
        content: z.string().min(1).describe('Cell content'),
        title: z.string().optional().describe('Cell title'),
        cellType: z.enum(['code', 'markdown']).optional().describe('Cell type')
      }
    },
    async ({ projectId, position, content, title, cellType }) =>
      toMcpResult(await runTool(projectId, 'insert_cell', { position, content, title, cellType }))
  );

  return server;
}
