import type { ComponentType } from 'react';
import {
  FileCode,
  FileText,
  FileSpreadsheet,
  FileType as FileTypeIcon,
  File
} from 'lucide-react';
import { CsvIcon } from '@/components/data/CsvIcon';
import { XlsIcon } from '@/components/data/XlsIcon';
import type { FileType } from '@/types/file';

/**
 * File icon mapping based on file type
 * Returns lucide-react icon name
 */
export const getFileIcon = (type: FileType): string => {
  const iconMap: Record<FileType, string> = {
    csv: 'Table',
    json: 'Braces',
    excel: 'Sheet',
    pdf: 'FileText',
    markdown: 'FileCode',
    word: 'FileType',
    text: 'FileText',
    other: 'File'
  };
  return iconMap[type];
};

/** Lucide icon component for each file type. */
export const fileIconByType: Record<FileType, ComponentType<{ className?: string }>> = {
  csv: CsvIcon,
  json: FileSpreadsheet,
  excel: XlsIcon,
  pdf: FileText,
  markdown: FileCode,
  word: FileTypeIcon,
  text: FileText,
  other: File
};

/** Tailwind color class applied to file icons when active / prominent. */
export const fileIconColorByType: Record<FileType, string> = {
  csv: 'text-green-500',
  json: 'text-blue-500',
  excel: 'text-emerald-500',
  pdf: 'text-red-500',
  markdown: 'text-purple-500',
  word: 'text-blue-500',
  text: 'text-muted-foreground',
  other: 'text-muted-foreground'
};

/** File types whose icons accept themeColorClass/isActive props (CsvIcon, XlsIcon). */
export const THEME_ICON_TYPES = new Set<FileType>(['csv', 'excel']);

/** Data file types that represent tabular datasets. */
export const DATA_FILE_TYPES = new Set<FileType>(['csv', 'json', 'excel']);

/** Document file types ingested for RAG context. */
export const DOC_FILE_TYPES = new Set<FileType>(['pdf', 'markdown', 'word', 'text']);

/**
 * Resolve the icon component and color metadata for a file type.
 * Centralizes the CsvIcon/XlsIcon special-casing so consumers don't repeat it.
 */
export function resolveFileIcon(type: FileType | string): {
  Icon: ComponentType<{ className?: string; themeColorClass?: string; isActive?: boolean }>;
  colorClass: string;
  usesTheme: boolean;
} {
  const ft = type as FileType;
  const usesTheme = THEME_ICON_TYPES.has(ft);
  return {
    Icon: fileIconByType[ft] ?? fileIconByType.other,
    colorClass: fileIconColorByType[ft] ?? fileIconColorByType.other,
    usesTheme,
  };
}

/** Map of Tailwind color classes used in this codebase → CSS hex values. */
const TAILWIND_HEX: Record<string, string> = {
  'text-green-500': '#22c55e',
  'text-blue-500': '#3b82f6',
  'text-emerald-500': '#10b981',
  'text-red-500': '#ef4444',
  'text-purple-500': '#a855f7',
  'text-muted-foreground': '#a1a1aa',
};

/**
 * Resolve a Tailwind color class to a CSS hex value.
 * Falls back to `#a1a1aa` (muted-foreground) for unknown classes.
 */
export function tailwindColorToHex(twClass: string): string {
  return TAILWIND_HEX[twClass] ?? TAILWIND_HEX['text-muted-foreground'];
}

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Determine file type from File object
 */
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
