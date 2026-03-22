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
const runRepository = createFilePreprocessingRunRepository(env.preprocessingRunsPath);

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
    dataframeName: asString(preprocessing?.dataframeName) ?? DEFAULT_DATAFRAME_NAME
  };
}

/**
 * Build the execution code for a preprocessing cell.
 *
 * The generated code calls kernel-level helpers injected by KERNEL_INIT_CODE
 * (load_preprocessing_dataset / save_preprocessing_dataset), so the code that
 * runs in the kernel matches what the user can see and debug.
 */
export function buildPreprocessingExecutionCode(
  context: PreprocessingExecutionContext,
  cellCode: string
): string {
  const { filename, datasetId, fileType, dataframeName } = context;
  const fn = JSON.stringify(filename);
  const ds = JSON.stringify(datasetId);
  const ft = JSON.stringify(fileType);
  const df = JSON.stringify(dataframeName);

  return [
    `${dataframeName} = load_preprocessing_dataset(${fn}, ${ds}, ${ft}, ${df})`,
    '',
    cellCode.trim(),
    '',
    `save_preprocessing_dataset(${fn}, ${ds}, ${ft}, ${df})`
  ].join('\n');
}
