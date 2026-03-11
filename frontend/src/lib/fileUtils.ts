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
