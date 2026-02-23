import { getOrCreateContainer, executeInContainer, type Container } from '../containerManager.js';
import * as repo from '../../repositories/notebookRepository.js';
import { env } from '../../config.js';
import type { ExecutionResult, RichOutput } from '../../types/execution.js';
import type { CellOutput, OutputRef } from '../../types/notebook.js';

/**
 * Get or ensure a container exists for a project.
 * Exported for use by LLM tools like install_package.
 */
export async function getOrEnsureContainer(projectId: string): Promise<Container> {
  const datasetPaths = await getDatasetPaths(projectId);
  return getOrCreateContainer({
    projectId,
    pythonVersion: '3.11',
    workspacePath: `${env.executionWorkspaceDir}/${projectId}`,
    datasetPaths
  });
}

// WebSocket broadcast function (injected from index.ts)
let broadcastToNotebook: ((notebookId: string, event: unknown) => void) | null = null;

/**
 * Set the WebSocket broadcast function.
 */
export function setWebSocketBroadcast(fn: (notebookId: string, event: unknown) => void): void {
  broadcastToNotebook = fn;
}

/**
 * Broadcast a WebSocket event.
 */
function broadcast(notebookId: string, type: string, data: Record<string, unknown>): void {
  if (broadcastToNotebook) {
    broadcastToNotebook(notebookId, { type, ...data, timestamp: new Date().toISOString() });
  }
}

/**
 * Execute a cell's code in a Docker container.
 * This is the main entry point for running cells via the run_cell MCP tool.
 */
export async function executeCell(
  cellId: string,
  projectId: string
): Promise<ExecutionResult> {
  // Get the cell
  const cell = await repo.getCell(cellId);
  if (!cell) {
    throw new Error(`Cell not found: ${cellId}`);
  }

  // Only code cells can be executed
  if (cell.cellType !== 'code') {
    throw new Error(`Cannot execute ${cell.cellType} cell`);
  }

  // Try to acquire lock
  const locked = await repo.lockCell(cellId, 'ai');
  if (!locked) {
    const lockInfo = await repo.getCellLock(cellId);
    throw new Error(`Cell is locked by ${lockInfo.by}`);
  }

  const startTime = Date.now();

  try {
    // Broadcast executing status
    await repo.updateCell(cellId, { executionStatus: 'running' });
    broadcast(cell.notebookId, 'cell:executing', { cellId });

    // Get or create container for this project
    const datasetPaths = await getDatasetPaths(projectId);
    const container = await getOrCreateContainer({
      projectId,
      pythonVersion: '3.11',
      workspacePath: `${env.executionWorkspaceDir}/${projectId}`,
      datasetPaths
    });

    // Copy dataset files to workspace so filenames work directly
    await copyDatasetsToWorkspace(projectId);

    // Execute the code
    const result = await executeInContainer(container, cell.content, env.executionTimeoutMs);

    // Calculate execution time
    const executionMs = Date.now() - startTime;

    // Process outputs (inline vs external storage)
    const { inlineOutputs, outputRefs } = await processOutputs(cellId, result.outputs);

    // Determine final status
    const executionStatus = result.status === 'success' ? 'success' : 'error';

    // Update cell with results
    const updatedCell = await repo.updateCell(cellId, {
      executionCount: (cell.executionCount ?? 0) + 1,
      executionStatus,
      executionDurationMs: executionMs,
      output: inlineOutputs,
      outputRefs
    });

    // Broadcast result
    broadcast(cell.notebookId, 'cell:executed', { cell: updatedCell });

    return {
      ...result,
      executionMs
    };
  } catch (error) {
    // Update cell with error status
    const errorMessage = error instanceof Error ? error.message : 'Execution failed';
    const executionMs = Date.now() - startTime;

    await repo.updateCell(cellId, {
      executionCount: (cell.executionCount ?? 0) + 1,
      executionStatus: 'error',
      executionDurationMs: executionMs,
      output: [{
        type: 'error',
        content: errorMessage
      }]
    });

    const updatedCell = await repo.getCell(cellId);
    if (updatedCell) {
      broadcast(cell.notebookId, 'cell:executed', { cell: updatedCell });
    }

    return {
      status: 'error',
      stdout: '',
      stderr: errorMessage,
      outputs: [{ type: 'error', content: errorMessage }],
      executionMs,
      error: errorMessage
    };
  } finally {
    // Always release lock
    await repo.unlockCell(cellId);
    broadcast(cell.notebookId, 'cell:unlocked', { cellId });
  }
}

/**
 * Process execution outputs, storing large ones externally.
 */
async function processOutputs(
  cellId: string,
  outputs: RichOutput[]
): Promise<{ inlineOutputs: CellOutput[]; outputRefs: OutputRef[] }> {
  const inlineOutputs: CellOutput[] = [];
  const outputRefs: OutputRef[] = [];

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    const cellOutput: CellOutput = {
      type: output.type,
      content: output.content,
      data: output.data as Record<string, unknown> | undefined,
      mimeType: output.mimeType
    };

    const contentSize = Buffer.byteLength(output.content, 'utf8');

    if (contentSize > env.notebookOutputMaxSize) {
      // Store externally
      const filename = `output_${i}_${Date.now()}.${getExtension(output.type)}`;
      const ref = await repo.saveLargeOutput(
        cellId,
        output.type,
        Buffer.from(output.content),
        filename,
        output.mimeType
      );
      outputRefs.push(ref);
    } else {
      // Store inline
      inlineOutputs.push(cellOutput);
    }
  }

  return { inlineOutputs, outputRefs };
}

/**
 * Get extension for output file based on type.
 */
function getExtension(type: string): string {
  switch (type) {
    case 'image':
      return 'png';
    case 'html':
      return 'html';
    case 'table':
      return 'json';
    case 'chart':
      return 'json';
    default:
      return 'txt';
  }
}

/**
 * Get dataset paths for a project to mount in the container.
 */
async function getDatasetPaths(projectId: string): Promise<string[]> {
  // Import dynamically to avoid circular dependencies
  const { createDatasetRepository } = await import('../../repositories/datasetRepository.js');
  const datasetRepo = createDatasetRepository(env.datasetMetadataPath);

  const datasets = await datasetRepo.list();
  const projectDatasets = datasets.filter((d) => d.projectId === projectId);

  // Construct dataset paths from datasetId and filename
  return projectDatasets
    .map((d) => `${env.datasetStorageDir}/${d.datasetId}/${d.filename}`)
    .filter((path): path is string => !!path);
}

/**
 * Copy dataset files to workspace so filenames work directly in code.
 * Files are copied to multiple locations to match all resolve_dataset_path() patterns:
 * - /workspace/datasets/{filename}
 * - /workspace/datasets/{datasetId}/{filename}
 * - /workspace/{filename}
 */
async function copyDatasetsToWorkspace(projectId: string): Promise<void> {
  const { createDatasetRepository } = await import('../../repositories/datasetRepository.js');
  const { copyFile, unlink, stat, mkdir } = await import('fs/promises');
  const { join } = await import('path');

  const datasetRepo = createDatasetRepository(env.datasetMetadataPath);
  const datasets = await datasetRepo.list();
  const projectDatasets = datasets.filter((d) => d.projectId === projectId);

  const workspacePath = `${env.executionWorkspaceDir}/${projectId}`;
  const datasetsPath = join(workspacePath, 'datasets');

  // Ensure datasets directory exists
  await mkdir(datasetsPath, { recursive: true });

  for (const dataset of projectDatasets) {
    const sourceFile = `${env.datasetStorageDir}/${dataset.datasetId}/${dataset.filename}`;

    // Ensure datasetId subdirectory exists
    const datasetIdPath = join(datasetsPath, dataset.datasetId);
    await mkdir(datasetIdPath, { recursive: true });

    // Copy to multiple locations for flexibility:
    // 1. /workspace/datasets/{filename} - for simple filename access
    // 2. /workspace/datasets/{datasetId}/{filename} - for datasetId-based access
    // 3. /workspace/{filename} - for direct access
    const destinations = [
      join(datasetsPath, dataset.filename),
      join(datasetIdPath, dataset.filename),
      join(workspacePath, dataset.filename)
    ];

    try {
      // Check if source exists
      await stat(sourceFile);

      for (const destFile of destinations) {
        // Remove existing file if it exists
        try {
          await unlink(destFile);
        } catch {
          // File doesn't exist, that's fine
        }

        // Copy the file
        await copyFile(sourceFile, destFile);
      }
    } catch (error) {
      console.warn(`[cellExecution] Could not copy dataset ${dataset.filename}: ${error}`);
    }
  }
}
