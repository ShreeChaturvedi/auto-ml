/**
 * TypeIcon — renders the appropriate Lucide icon for a column data type.
 */

import {
  Type,
  Hash,
  Calculator,
  ToggleLeft,
  Calendar,
  CircleHelp,
} from 'lucide-react';
import type { ColumnDataType } from '@/types/file';

export function TypeIcon({ type, className }: { type: ColumnDataType; className?: string }) {
  switch (type) {
    case 'string':
      return <Type className={className} />;
    case 'integer':
      return <Hash className={className} />;
    case 'float':
      return <Calculator className={className} />;
    case 'boolean':
      return <ToggleLeft className={className} />;
    case 'date':
      return <Calendar className={className} />;
    case 'unknown':
    default:
      return <CircleHelp className={className} />;
  }
}
