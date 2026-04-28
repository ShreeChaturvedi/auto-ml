import type { FileType } from '@/types/file';

type DatasetUploadFileType = Extract<FileType, 'csv' | 'json' | 'excel'>;
const JSON_LINES_EXTENSIONS = ['.jsonl', '.ndjson'] as const;

const DATASET_UPLOAD_EXTENSIONS: Record<DatasetUploadFileType, readonly string[]> = {
  csv: ['.csv', '.tsv'],
  json: ['.json', ...JSON_LINES_EXTENSIONS],
  excel: ['.xlsx'],
};

const LEGACY_DATASET_EXTENSIONS: ReadonlyArray<readonly [string, DatasetUploadFileType]> = [
  ['.xls', 'excel'],
];

const DATASET_FILE_TYPE_BY_EXTENSION = new Map<string, DatasetUploadFileType>([
  ...Object.entries(DATASET_UPLOAD_EXTENSIONS).flatMap(([fileType, extensions]) =>
    extensions.map((extension) => [extension, fileType as DatasetUploadFileType] as const)
  ),
  ...LEGACY_DATASET_EXTENSIONS,
]);

const DOCUMENT_UPLOAD_EXTENSIONS = {
  pdf: ['.pdf'],
  word: ['.docx'],
  markdown: ['.md', '.markdown'],
  text: ['.txt', '.log'],
  html: ['.html', '.htm'],
  xml: ['.xml'],
  yaml: ['.yml', '.yaml'],
  rtf: ['.rtf'],
} as const;

export const PROJECT_FILE_UPLOAD_ACCEPTED_TYPES = {
  'text/csv': DATASET_UPLOAD_EXTENSIONS.csv,
  'application/json': ['.json'],
  'application/x-ndjson': JSON_LINES_EXTENSIONS,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': DATASET_UPLOAD_EXTENSIONS.excel,
  'application/pdf': DOCUMENT_UPLOAD_EXTENSIONS.pdf,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': DOCUMENT_UPLOAD_EXTENSIONS.word,
  'text/markdown': DOCUMENT_UPLOAD_EXTENSIONS.markdown,
  'text/plain': DOCUMENT_UPLOAD_EXTENSIONS.text,
  'text/html': DOCUMENT_UPLOAD_EXTENSIONS.html,
  'application/xml': DOCUMENT_UPLOAD_EXTENSIONS.xml,
  'text/xml': DOCUMENT_UPLOAD_EXTENSIONS.xml,
  'application/yaml': DOCUMENT_UPLOAD_EXTENSIONS.yaml,
  'text/yaml': DOCUMENT_UPLOAD_EXTENSIONS.yaml,
  'application/rtf': DOCUMENT_UPLOAD_EXTENSIONS.rtf,
} as const satisfies Record<string, readonly string[]>;

const PROJECT_FILE_ATTACHMENT_EXTENSIONS = [
  ...DOCUMENT_UPLOAD_EXTENSIONS.pdf,
  ...DOCUMENT_UPLOAD_EXTENSIONS.word,
  ...DOCUMENT_UPLOAD_EXTENSIONS.markdown,
  ...DOCUMENT_UPLOAD_EXTENSIONS.text,
  ...DATASET_UPLOAD_EXTENSIONS.json,
  ...DATASET_UPLOAD_EXTENSIONS.csv,
  ...DATASET_UPLOAD_EXTENSIONS.excel,
  ...DOCUMENT_UPLOAD_EXTENSIONS.html,
  ...DOCUMENT_UPLOAD_EXTENSIONS.xml,
  ...DOCUMENT_UPLOAD_EXTENSIONS.yaml,
  ...DOCUMENT_UPLOAD_EXTENSIONS.rtf,
];

export const PROJECT_FILE_ATTACHMENT_ACCEPT = PROJECT_FILE_ATTACHMENT_EXTENSIONS.join(',');

export const PROJECT_FILE_UPLOAD_EMPTY_STATE_COPY =
  'Drag and drop files here, or click anywhere. Supports CSV, TSV, JSON, JSONL, NDJSON, and XLSX for data and PDF/Markdown/TXT for context.';

export function datasetFileTypeFromExtension(extension: string | undefined | null): DatasetUploadFileType | undefined {
  if (!extension) {
    return undefined;
  }

  const normalized = extension.startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;

  return DATASET_FILE_TYPE_BY_EXTENSION.get(normalized);
}
