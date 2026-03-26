import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createFilePreprocessingRunRepository } from '../../repositories/preprocessingRunRepository.js';
import type { DatasetFileType } from '../../types/dataset.js';
import { asRecord, asString } from '../../utils/typeCoercion.js';

export interface PreprocessingExecutionContext {
  runId: string;
  stepId: string;
  datasetId: string;
  filename: string;
  fileType: DatasetFileType;
  dataframeName: string;
}

const DEFAULT_DATAFRAME_NAME = 'df';
const PYTHON_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);

function sanitizeIdentifier(name: string | undefined): string {
  return name && PYTHON_IDENTIFIER_RE.test(name) ? name : DEFAULT_DATAFRAME_NAME;
}

export async function resolvePreprocessingExecutionContext(
  projectId: string,
  metadata: unknown
): Promise<PreprocessingExecutionContext | null> {
  const preprocessing = asRecord(asRecord(metadata)?.preprocessing);
  const runId = asString(preprocessing?.runId);
  const stepId = asString(preprocessing?.stepId);
  let datasetId = asString(preprocessing?.datasetId);
  if (!runId || !stepId) {
    return null;
  }
  if (!datasetId) {
    const run = await runRepository.getById(runId);
    const checkpoint = run?.checkpoints.find((cp) => cp.stepIds.includes(stepId));
    datasetId = checkpoint?.datasetId ?? run?.activeDatasetId;
    if (!datasetId) {
      return null;
    }
  }

  const datasetRepository = createDatasetRepository(env.datasetMetadataPath);
  const dataset = await datasetRepository.getById(datasetId);
  if (!dataset || dataset.projectId !== projectId) {
    return null;
  }

  return {
    runId,
    stepId,
    datasetId,
    filename: dataset.filename,
    fileType: dataset.fileType,
    dataframeName: sanitizeIdentifier(asString(preprocessing?.dataframeName))
  };
}

/**
 * Build visible cell content that includes dataset load/save calls.
 *
 * The returned string is written as the cell's content so the user sees
 * exactly what runs in the kernel — no invisible wrapping at execution time.
 * The helpers (load_preprocessing_dataset / save_preprocessing_dataset) are
 * injected into the kernel via KERNEL_INIT_CODE in kernelManager.ts.
 */
export function buildPreprocessingCellContent(opts: {
  filename: string;
  datasetId: string;
  fileType: DatasetFileType;
  dataframeName: string;
  userCode: string;
}): string {
  const fn = JSON.stringify(opts.filename);
  const ds = JSON.stringify(opts.datasetId);
  const ft = JSON.stringify(opts.fileType);
  const df = JSON.stringify(opts.dataframeName);

  return [
    `${opts.dataframeName} = load_preprocessing_dataset(${fn}, ${ds}, ${ft}, ${df})`,
    '',
    opts.userCode.trim(),
    '',
    `save_preprocessing_dataset(${fn}, ${ds}, ${ft}, ${df})`
  ].join('\n');
}
