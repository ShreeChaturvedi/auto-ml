/**
 * edaConstants — static lookup tables and domain classification for EDA components.
 */

import {
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { DataQualitySummary } from '@/types/file';

export const DATA_TYPE_ICONS: Record<DataQualitySummary['dataType'], typeof Hash> = {
  numeric: Hash,
  categorical: Type,
  datetime: Calendar,
  boolean: ToggleLeft,
  mixed: HelpCircle,
};

export const DATA_TYPE_COLORS: Record<DataQualitySummary['dataType'], string> = {
  numeric: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  categorical: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  datetime: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  boolean: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  mixed: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

export function getSeverityLabel(completeness: number): {
  label: string;
  colorClass: string;
  colorVar: string;
  icon: typeof CheckCircle2;
} {
  if (completeness >= 100) {
    return { label: 'Pristine', colorClass: 'text-green-500', colorVar: '--eda-pristine', icon: CheckCircle2 };
  }
  if (completeness >= 95) {
    return { label: 'Clean', colorClass: 'text-teal-500', colorVar: '--eda-clean', icon: CheckCircle2 };
  }
  if (completeness >= 80) {
    return { label: 'Fair', colorClass: 'text-amber-500', colorVar: '--eda-fair', icon: AlertTriangle };
  }
  return { label: 'Poor', colorClass: 'text-red-500', colorVar: '--eda-poor', icon: AlertTriangle };
}
