import type { ComponentType } from 'react';
import { File } from 'lucide-react';
import { CsvIcon, XlsIcon, PdfIcon, DocIcon, MarkdownIcon, JsnIcon, TxtIcon } from '@/components/data/CsvIcon';
import type { FileType } from '@/types/file';

/** Icon component for each file type. */
export const fileIconByType: Record<FileType, ComponentType<{ className?: string }>> = {
  csv: CsvIcon,
  json: JsnIcon,
  excel: XlsIcon,
  pdf: PdfIcon,
  markdown: MarkdownIcon,
  word: DocIcon,
  text: TxtIcon,
  other: File
};

/** Tailwind color class applied to file icons (theme-responsive). */
export const fileIconColorByType: Record<FileType, string> = {
  csv: 'text-green-600 dark:text-green-400',
  json: 'text-blue-600 dark:text-blue-400',
  excel: 'text-emerald-600 dark:text-emerald-400',
  pdf: 'text-red-600 dark:text-red-400',
  markdown: 'text-foreground',
  word: 'text-blue-700 dark:text-blue-400',
  text: 'text-muted-foreground',
  other: 'text-muted-foreground'
};

/** Data file types that represent tabular datasets. */
export const DATA_FILE_TYPES = new Set<FileType>(['csv', 'json', 'excel']);

/** Document file types ingested for RAG context. */
export const DOC_FILE_TYPES = new Set<FileType>(['pdf', 'markdown', 'word', 'text']);

/**
 * Resolve the icon component and color class for a file type.
 */
export function resolveFileIcon(type: FileType | string): {
  Icon: ComponentType<{ className?: string }>;
  colorClass: string;
} {
  const ft = type as FileType;
  return {
    Icon: fileIconByType[ft] ?? fileIconByType.other,
    colorClass: fileIconColorByType[ft] ?? fileIconColorByType.other,
  };
}

/** Map of compound Tailwind color classes → CSS hex values (uses the dark-mode shade). */
const TAILWIND_HEX: Record<string, string> = {
  'text-green-600 dark:text-green-400': '#4ade80',
  'text-blue-600 dark:text-blue-400': '#60a5fa',
  'text-blue-700 dark:text-blue-400': '#60a5fa',
  'text-emerald-600 dark:text-emerald-400': '#34d399',
  'text-red-600 dark:text-red-400': '#f87171',
  'text-foreground': '#fafafa',
  'text-muted-foreground': '#a1a1aa',
};

/**
 * Resolve a Tailwind color class to a CSS hex value.
 * Falls back to `#a1a1aa` (muted-foreground) for unknown classes.
 */
export function tailwindColorToHex(twClass: string): string {
  return TAILWIND_HEX[twClass] ?? TAILWIND_HEX['text-muted-foreground'];
}

/** Format file size for display. */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/** Determine file type from File object. */
export const getFileType = (file: File): FileType => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') return 'csv';
  if (extension === 'json') return 'json';
  if (extension === 'xlsx' || extension === 'xls') return 'excel';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'md') return 'markdown';
  if (extension === 'docx' || extension === 'doc') return 'word';
  if (
    extension === 'txt'
    || extension === 'text'
    || extension === 'log'
    || extension === 'html'
    || extension === 'htm'
    || extension === 'xml'
    || extension === 'yml'
    || extension === 'yaml'
    || extension === 'rtf'
  ) {
    return 'text';
  }

  return 'other';
};
