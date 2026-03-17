/**
 * columnTypeUtils — shared getTypeLabel helper for column data types.
 */

import type { ColumnDataType } from '@/types/file';

export function getTypeLabel(type: ColumnDataType): string {
  switch (type) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Integer';
    case 'float':
      return 'Float';
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'Date';
    case 'unknown':
    default:
      return 'Unknown';
  }
}
