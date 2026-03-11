/**
 * DataViewerTabBar - File tab bar with error banner for the data viewer.
 *
 * Extracted from DataViewerTab to isolate the tab navigation and error display.
 */

import { AlertCircle } from 'lucide-react';
import { FileTabBar } from './FileTabBar';

export interface DataViewerTabBarProps {
  projectId: string;
  queryIconColorClassName?: string;
  queryError: string | null;
  onDismissError: () => void;
}

export function DataViewerTabBar({
  projectId,
  queryIconColorClassName,
  queryError,
  onDismissError
}: DataViewerTabBarProps) {
  return (
    <>
      {/* File Tab Bar */}
      <FileTabBar
        projectId={projectId}
        queryIconColorClassName={queryIconColorClassName}
      />

      {/* Error Banner */}
      {queryError && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Query Error</p>
            <p className="text-sm text-destructive/90 mt-1 whitespace-pre-wrap">{queryError}</p>
          </div>
          <button
            onClick={onDismissError}
            className="text-destructive/70 hover:text-destructive transition-colors"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
