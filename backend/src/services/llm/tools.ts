/**
 * Tool Dispatcher - Routes tool calls to domain-specific handlers
 *
 * Implementations live in `toolHandlers/`. This file maps tool names
 * to their handler functions and provides the single `executeToolCall` entry point.
 */

import type { ToolCall, ToolResult } from '../../types/llm.js';

import {
  deleteCell,
  editCell,
  insertCell,
  listCells,
  readCell,
  reorderCells,
  runCell,
  writeCell
} from './toolHandlers/cellHandlers.js';
import {
  getDatasetProfile,
  getDatasetSample,
  listProjectFiles,
  searchProjectDocuments
} from './toolHandlers/dataHandlers.js';
import {
  handleInstallPackage,
  handleListPackages,
  handleUninstallPackage
} from './toolHandlers/packageHandlers.js';

type ToolHandler = (projectId: string, args: ToolCall['args']) => Promise<unknown>;

const toolHandlers = new Map<string, ToolHandler>([
  // Data tools
  ['list_project_files', (projectId) => listProjectFiles(projectId)],
  ['get_dataset_profile', (_projectId, args) => getDatasetProfile(args)],
  ['get_dataset_sample', (_projectId, args) => getDatasetSample(args)],
  ['search_documents', (projectId, args) => searchProjectDocuments(projectId, args)],

  // Cell tools
  ['list_cells', (projectId, args) => listCells(projectId, args)],
  ['read_cell', (_projectId, args) => readCell(args)],
  ['write_cell', (projectId, args) => writeCell(projectId, args)],
  ['edit_cell', (_projectId, args) => editCell(args)],
  ['run_cell', (projectId, args) => runCell(projectId, args)],
  ['delete_cell', (_projectId, args) => deleteCell(args)],
  ['reorder_cells', (projectId, args) => reorderCells(projectId, args)],
  ['insert_cell', (projectId, args) => insertCell(projectId, args)],

  // User interaction tools
  ['ask_user', () => Promise.resolve({ type: 'user_interaction', message: 'Awaiting user response' })],
  ['plan_exit', () => Promise.resolve({ type: 'plan_artifact', message: 'Plan finalized by model' })],

  // Package management tools
  ['install_package', (projectId, args) => handleInstallPackage(projectId, args)],
  ['uninstall_package', (projectId, args) => handleUninstallPackage(projectId, args)],
  ['list_packages', (projectId) => handleListPackages(projectId)],
]);

export async function executeToolCall(projectId: string, call: ToolCall): Promise<ToolResult> {
  try {
    const handler = toolHandlers.get(call.tool);
    if (!handler) {
      return { id: call.id, tool: call.tool, output: null, error: 'Unsupported tool' };
    }
    return { id: call.id, tool: call.tool, output: await handler(projectId, call.args) };
  } catch (error) {
    return {
      id: call.id,
      tool: call.tool,
      output: null,
      error: error instanceof Error ? error.message : 'Tool execution failed'
    };
  }
}
