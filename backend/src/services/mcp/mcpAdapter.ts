import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createMcpServer } from './mcpServer.js';
import type { LlmToolDefinition } from '../llm/llmClient.js';
import { LLM_RENDER_UI_TOOL } from '../llm/toolRegistry.js';

type JsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
};

let cachedToolDefinitions: LlmToolDefinition[] | null = null;

function stripProjectId(inputSchema: JsonSchema | undefined): JsonSchema | undefined {
  if (!inputSchema || inputSchema.type !== 'object') return inputSchema;
  const properties = { ...(inputSchema.properties ?? {}) };
  if ('projectId' in properties) {
    delete properties.projectId;
  }
  const required = inputSchema.required?.filter((name) => name !== 'projectId');
  return {
    ...inputSchema,
    properties,
    required: required?.length ? required : undefined
  };
}

function sanitizeGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) {
    return schema.map((entry) => sanitizeGeminiSchema(entry));
  }
  const disallowedKeys = new Set(['$schema', 'additionalProperties']);
  const entries = Object.entries(schema as Record<string, unknown>);
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (disallowedKeys.has(key)) continue;
    sanitized[key] = sanitizeGeminiSchema(value);
  }
  return sanitized;
}

function ensureObjectSchema(schema: unknown): JsonSchema {
  if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
    const typed = schema as JsonSchema;
    if (typed.type) return typed;
    return {
      type: 'object',
      properties: typed.properties ?? {},
      required: typed.required
    };
  }
  return { type: 'object', properties: {} };
}

export async function listMcpToolsForLlm(): Promise<LlmToolDefinition[]> {
  if (cachedToolDefinitions) return cachedToolDefinitions;

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  const client = new Client({ name: 'automl-tool-adapter', version: '1.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const result = await client.listTools();

  await client.close();
  await server.close();

  const mcpTools = result.tools.map((tool) => {
    const normalizedSchema = stripProjectId(tool.inputSchema);
    const sanitizedSchema = sanitizeGeminiSchema(normalizedSchema ?? {});
    return {
      name: tool.name,
      description: tool.description ?? '',
      parameters: ensureObjectSchema(sanitizedSchema)
    };
  });

  cachedToolDefinitions = [...mcpTools, LLM_RENDER_UI_TOOL];

  return cachedToolDefinitions;
}

export function clearMcpToolCache() {
  cachedToolDefinitions = null;
}

/**
 * Execute a tool via MCP protocol.
 * This is the proper way to execute tools - through the MCP client/server pair.
 */
export async function executeMcpTool(
  projectId: string,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<{ output?: unknown; error?: string }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  const client = new Client({ name: 'automl-tool-executor', version: '1.0.0' });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // MCP tools expect projectId as part of args
    const fullArgs = { projectId, ...args };

    const result = await client.callTool({ name: toolName, arguments: fullArgs });

    await client.close();
    await server.close();

    // Extract result from MCP response
    if (result.isError) {
      const content = result.content;
      const errorContent = Array.isArray(content) && content.length > 0 ? content[0] : null;
      const errorText = errorContent && typeof errorContent === 'object' && 'text' in errorContent
        ? String(errorContent.text)
        : 'Tool execution failed';
      return { error: errorText };
    }

    // Parse structured content or text content
    if (result.structuredContent) {
      return { output: result.structuredContent };
    }

    const content = result.content;
    const textContent = Array.isArray(content) && content.length > 0 ? content[0] : null;
    if (textContent && typeof textContent === 'object' && 'text' in textContent) {
      const text = String(textContent.text);
      try {
        return { output: JSON.parse(text) };
      } catch {
        return { output: text };
      }
    }

    return { output: result.content };
  } catch (error) {
    await client.close().catch(() => { });
    await server.close().catch(() => { });
    return { error: error instanceof Error ? error.message : 'MCP tool execution failed' };
  }
}
