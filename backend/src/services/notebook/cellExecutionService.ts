import { join } from 'node:path';

import { env } from '../../config.js';
import * as repo from '../../repositories/notebookRepository.js';
import type { ExecutionResult, RichOutput } from '../../types/execution.js';
import type { CellOutput, OutputRef } from '../../types/notebook.js';
import { getOrCreateContainer, type Container } from '../containerManager.js';
import * as kernelManager from '../kernelManager.js';

import { resolveDatasetSyncMode, type DatasetSyncMode } from './datasetSyncMode.js';
import { getDatasetPaths, copyDatasetsToWorkspace } from './datasetWorkspace.js';
import { decodeBase64DataUrl, extensionForMimeType } from './outputUtils.js';

function shouldRetryMissingPreprocessingHelper(cellContent: string, errorMessage: string): boolean {
  if (!cellContent.includes('load_preprocessing_dataset(') && !cellContent.includes('save_preprocessing_dataset(')) {
    return false;
  }

  return /NameError: name 'load_preprocessing_dataset' is not defined/i.test(errorMessage)
    || /NameError: name 'save_preprocessing_dataset' is not defined/i.test(errorMessage)
    || /load_preprocessing_dataset' is not defined/i.test(errorMessage)
    || /save_preprocessing_dataset' is not defined/i.test(errorMessage);
}

export async function getOrEnsureContainer(projectId: string): Promise<Container> {
  const datasetPaths = await getDatasetPaths(projectId);
  return getOrCreateContainer({
    projectId,
    pythonVersion: '3.11',
    workspacePath: join(env.executionWorkspaceDir, projectId),
    datasetPaths
  });
}

// WebSocket broadcast function (injected from index.ts)
let broadcastToNotebook: ((notebookId: string, event: unknown) => void) | null = null;

export function setWebSocketBroadcast(fn: (notebookId: string, event: unknown) => void): void {
  broadcastToNotebook = fn;
}

function broadcast(notebookId: string, type: string, data: Record<string, unknown>): void {
  if (broadcastToNotebook) {
    broadcastToNotebook(notebookId, { type, ...data, timestamp: new Date().toISOString() });
  }
}

export async function executeCell(
  cellId: string,
  projectId: string,
  options?: {
    datasetSyncMode?: DatasetSyncMode;
  }
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
      workspacePath: join(env.executionWorkspaceDir, projectId),
      datasetPaths
    });

    const datasetSyncMode = resolveDatasetSyncMode(options?.datasetSyncMode, cell.metadata);

    // Copy dataset files to workspace so filenames work directly.
    // In continue mode, preserve edited working files across actions.
    await copyDatasetsToWorkspace(projectId, datasetSyncMode);

    // Cell content is executed as-is — preprocessing cells already include
    // visible load/save helper calls in their content, so no wrapping needed.
    const runKernelExecution = () => kernelManager.execute(
      container,
      cell.content,
      env.executionTimeoutMs,
      (output) => {
        broadcast(cell.notebookId, 'cell:output', { cellId, output });
      }
    );

    let result: ExecutionResult;
    try {
      result = await runKernelExecution();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!shouldRetryMissingPreprocessingHelper(cell.content, errorMessage)) {
        throw error;
      }

      await kernelManager.restartKernel(container);
      result = await runKernelExecution();
    }

    if (result.status === 'error' && shouldRetryMissingPreprocessingHelper(cell.content, result.error ?? result.stderr ?? '')) {
      await kernelManager.restartKernel(container);
      result = await runKernelExecution();
    }

    // Calculate execution time
    const executionMs = Date.now() - startTime;

    // Process outputs (inline vs external storage)
    const { inlineOutputs, outputRefs } = await processOutputs(cellId, result.outputs);

    // Determine final status
    const executionStatus = result.status === 'success' ? 'success' : 'error';

    // Update cell with results and assign notebook-global execution order.
    const updatedCell = await repo.markCellExecuted(cellId, {
      executionStatus,
      executionDurationMs: executionMs,
      output: inlineOutputs,
      outputRefs
    });

    // Broadcast result
    broadcast(cell.notebookId, 'cell:executed', { cell: updatedCell });

    // Return the persisted/portable outputs (refs) instead of raw execution outputs (data URLs/artifact paths).
    // This avoids huge payloads and UI flicker when the cell reloads from the server.
    return {
      ...result,
      outputs: inlineOutputs,
      executionMs,
      executionOrder: updatedCell.executionOrder ?? null
    };
  } catch (error) {
    // Update cell with error status
    const errorMessage = error instanceof Error ? error.message : 'Execution failed';
    const executionMs = Date.now() - startTime;

    const updatedCell = await repo.markCellExecuted(cellId, {
      executionStatus: 'error',
      executionDurationMs: executionMs,
      output: [{
        type: 'error',
        content: errorMessage
      }],
      outputRefs: []
    });
    broadcast(cell.notebookId, 'cell:executed', { cell: updatedCell });

    return {
      status: 'error',
      stdout: '',
      stderr: errorMessage,
      outputs: [{ type: 'error', content: errorMessage }],
      executionMs,
      error: errorMessage,
      executionOrder: updatedCell.executionOrder ?? null
    };
  } finally {
    // Always release lock
    await repo.unlockCell(cellId);
    broadcast(cell.notebookId, 'cell:unlocked', { cellId });
  }
}

async function processOutputs(
  cellId: string,
  outputs: RichOutput[]
): Promise<{ inlineOutputs: CellOutput[]; outputRefs: OutputRef[] }> {
  const inlineOutputs: CellOutput[] = [];
  const outputRefs: OutputRef[] = [];

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];

    if (output.type === 'image') {
      const decoded = decodeBase64DataUrl(output.content);
      if (decoded) {
        const filename = `image_${i}_${Date.now()}.${extensionForMimeType(decoded.mimeType)}`;
        const ref = await repo.saveLargeOutput(
          cellId,
          'image',
          decoded.buffer,
          filename,
          decoded.mimeType
        );
        outputRefs.push(ref);
        inlineOutputs.push({
          type: 'image',
          content: ref.ref,
          mimeType: decoded.mimeType
        });
        continue;
      }
    }

    const cellOutput: CellOutput = {
      type: output.type,
      content: output.content,
      data: output.data as Record<string, unknown> | undefined,
      mimeType: output.mimeType
    };

    const contentSize = Buffer.byteLength(output.content, 'utf8');

    if (contentSize > env.notebookOutputMaxSize) {
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
      inlineOutputs.push(cellOutput);
    }
  }

  return { inlineOutputs, outputRefs };
}

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
