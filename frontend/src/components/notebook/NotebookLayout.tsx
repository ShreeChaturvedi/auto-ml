/**
 * NotebookLayout - Split pane layout for LLM chat + notebook editor
 *
 * Features:
 * - Resizable split pane (chat left, notebook right)
 * - Notebook pane only appears when cells exist
 * - Real-time WebSocket sync
 * - AI editing indicators on locked cells
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable';
import { ChatPanel } from './ChatPanel';
import { NotebookEditor } from './NotebookEditor';
import { useNotebookStore } from '@/stores/notebookStore';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wifi, WifiOff, Notebook } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotebookLayoutProps {
  className?: string;
}

export function NotebookLayout({ className }: NotebookLayoutProps) {
  const { projectId } = useParams<{ projectId: string }>();

  const {
    notebook,
    cells,
    isLoading,
    isConnected,
    error,
    initializeNotebook,
    disconnect
  } = useNotebookStore();

  // Track if notebook pane should be visible
  const [showNotebook, setShowNotebook] = useState(false);

  // Initialize notebook on mount
  useEffect(() => {
    if (projectId) {
      initializeNotebook(projectId);
    }

    return () => {
      disconnect();
    };
  }, [projectId, initializeNotebook, disconnect]);

  // Show notebook pane when cells exist
  useEffect(() => {
    if (cells.length > 0) {
      setShowNotebook(true);
    }
  }, [cells.length]);

  // Allow user to toggle notebook visibility
  const handleToggleNotebook = useCallback(() => {
    setShowNotebook((prev) => !prev);
  }, []);

  // Loading state
  if (isLoading && !notebook) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading notebook...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !notebook) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <div className="rounded-full bg-destructive/10 p-3">
            <WifiOff className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium">Failed to load notebook</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Status bar */}
      <div className="flex h-10 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Badge
            variant={isConnected ? 'default' : 'secondary'}
            className="gap-1.5 text-xs"
          >
            {isConnected ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>

          {cells.length > 0 && (
            <Badge variant="outline" className="gap-1.5 text-xs">
              <Notebook className="h-3 w-3" />
              {cells.length} cell{cells.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Toggle notebook visibility */}
        {cells.length > 0 && (
          <button
            onClick={handleToggleNotebook}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showNotebook ? 'Hide notebook' : 'Show notebook'}
          </button>
        )}
      </div>

      {/* Main content - always use split layout to maintain consistent chat width */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          {/* Chat Panel - always 50% to prevent text reflow */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <ChatPanel projectId={projectId ?? ''} />
          </ResizablePanel>

          {/* Resize Handle */}
          <ResizableHandle withHandle />

          {/* Notebook Panel - shows content or empty state */}
          <ResizablePanel defaultSize={50} minSize={30}>
            {showNotebook && cells.length > 0 ? (
              <NotebookEditor projectId={projectId ?? ''} />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted/5">
                <div className="flex flex-col items-center gap-3 text-center max-w-xs">
                  <div className="rounded-full bg-muted/20 p-4">
                    <Notebook className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Notebook cells will appear here when the AI creates them, or click + to add one
                  </p>
                </div>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
