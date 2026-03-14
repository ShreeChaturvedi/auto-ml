import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
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

export async function resolvePreprocessingExecutionContext(
  projectId: string,
  metadata: unknown
): Promise<PreprocessingExecutionContext | null> {
  const preprocessing = asRecord(asRecord(metadata)?.preprocessing);
  const runId = asString(preprocessing?.runId);
  const stepId = asString(preprocessing?.stepId);
  const datasetId = asString(preprocessing?.datasetId);
  if (!runId || !stepId || !datasetId) {
    return null;
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

export function buildPreprocessingExecutionCode(
  context: PreprocessingExecutionContext,
  cellCode: string
): string {
  const metadataJson = JSON.stringify({
    runId: context.runId,
    stepId: context.stepId,
    datasetId: context.datasetId,
    filename: context.filename
  });

  return [
    'import pandas as pd',
    `_automl_preprocessing = ${metadataJson}`,
    `_automl_preprocessing["dataset_path"] = resolve_dataset_path(${JSON.stringify(context.filename)}, ${JSON.stringify(context.datasetId)})`,
    'dataset_path = _automl_preprocessing["dataset_path"]',
    `active_dataset_id = ${JSON.stringify(context.datasetId)}`,
    ...buildLoadLines(context),
    '',
    cellCode.trim(),
    '',
    ...buildPersistLines(context)
  ].join('\n');
}

function buildLoadLines(context: PreprocessingExecutionContext): string[] {
  const dataframeName = context.dataframeName;
  return [
    `if "_automl_preprocessing_df" in globals() and isinstance(_automl_preprocessing_df, pd.DataFrame):`,
    `    ${dataframeName} = _automl_preprocessing_df`,
    'else:',
    ...buildIndentedLoaderLines(context.fileType, dataframeName),
    `    _automl_preprocessing_df = ${dataframeName}`
  ];
}

function buildIndentedLoaderLines(fileType: DatasetFileType, dataframeName: string): string[] {
  return buildLoaderLines(fileType, dataframeName).map((line) => `    ${line}`);
}

function buildLoaderLines(fileType: DatasetFileType, dataframeName: string): string[] {
  if (fileType === 'json') {
    return [
      'try:',
      `    ${dataframeName} = pd.read_json(dataset_path)`,
      'except ValueError:',
      `    ${dataframeName} = pd.read_json(dataset_path, lines=True)`
    ];
  }
  if (fileType === 'xlsx') {
    return [`${dataframeName} = pd.read_excel(dataset_path)`];
  }
  return [`${dataframeName} = pd.read_csv(dataset_path)`];
}

function buildPersistLines(context: PreprocessingExecutionContext): string[] {
  const dataframeName = context.dataframeName;
  return [
    `if "${dataframeName}" not in globals():`,
    `    raise ValueError("Preprocessing cell must leave the active dataframe in variable '${dataframeName}'.")`,
    `if not isinstance(${dataframeName}, pd.DataFrame):`,
    `    raise TypeError("Preprocessing variable '${dataframeName}' must be a pandas DataFrame.")`,
    `_automl_preprocessing_df = ${dataframeName}`,
    ...buildPersistWriterLines(context.fileType, dataframeName)
  ];
}

function buildPersistWriterLines(fileType: DatasetFileType, dataframeName: string): string[] {
  if (fileType === 'json') {
    return [`${dataframeName}.to_json(dataset_path, orient="records")`];
  }
  if (fileType === 'xlsx') {
    return [`${dataframeName}.to_excel(dataset_path, index=False)`];
  }
  return [`${dataframeName}.to_csv(dataset_path, index=False)`];
}
