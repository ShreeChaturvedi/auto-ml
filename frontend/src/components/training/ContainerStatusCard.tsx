/**
 * ContainerStatusCard - Displays cloud runtime status, Python version selector, and connect button.
 */

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PythonVersion } from '@/lib/api/execution';
import { cn } from '@/lib/utils';
import { Database, Info, Loader2, Package, RefreshCcw } from 'lucide-react';

interface ContainerStatusCardProps {
  cloudAvailable: boolean;
  cloudInitializing: boolean;
  sessionId: string | null;
  runtimeStatus: string;
  pythonVersion: PythonVersion;
  setPythonVersion: (version: PythonVersion) => void;
  onConnect: () => void;
}

export function ContainerStatusCard({
  cloudAvailable,
  cloudInitializing,
  sessionId,
  runtimeStatus,
  pythonVersion,
  setPythonVersion,
  onConnect
}: ContainerStatusCardProps) {
  return (
    <>
      {/* Minimal status line */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              runtimeStatus === 'Ready' || runtimeStatus === 'Connected'
                ? 'bg-emerald-500'
                : runtimeStatus === 'Connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : runtimeStatus === 'Unavailable'
                    ? 'bg-destructive'
                    : 'bg-muted-foreground/60'
            )}
          />
          <span className={cn(
              'text-sm',
              runtimeStatus === 'Ready' || runtimeStatus === 'Connected'
                ? 'text-emerald-600 dark:text-emerald-400'
                : runtimeStatus === 'Connecting'
                  ? 'text-amber-600 dark:text-amber-400'
                  : runtimeStatus === 'Unavailable'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
            )}>{runtimeStatus}</span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span className="text-xs text-muted-foreground">Python</span>
          <Select value={pythonVersion} onValueChange={setPythonVersion}>
            <SelectTrigger className="h-7 w-[84px] text-xs">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3.11">3.11</SelectItem>
              <SelectItem value="3.10">3.10</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={onConnect}
                disabled={!cloudAvailable || cloudInitializing}
              >
                {cloudInitializing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCcw className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {sessionId ? 'Reconnect' : 'Connect'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Info section */}
      <div className="rounded-lg border border-dashed p-4 space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            {sessionId
              ? 'Cloud session keeps packages and data cached for faster runs.'
              : 'Cloud runtime will create a session on first run.'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 shrink-0" />
          <span>Datasets mount at `/workspace/datasets` and resolve via `resolve_dataset_path()`.</span>
        </div>
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 shrink-0" />
          <span>Install packages per session using pip.</span>
        </div>
      </div>
    </>
  );
}
