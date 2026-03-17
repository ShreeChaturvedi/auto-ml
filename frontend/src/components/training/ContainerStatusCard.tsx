/**
 * ContainerStatusCard - Displays cloud runtime status, Python version selector, and connect button.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PythonVersion } from '@/lib/api/execution';
import { cn } from '@/lib/utils';
import { Database, Info, Loader2, Package } from 'lucide-react';

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
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Cloud Runtime</h3>
          <p className="text-xs text-muted-foreground">
            Server-side Python with full library support (NumPy, Pandas, Scikit-learn, PyTorch, etc.)
          </p>
        </div>
        <Badge variant={cloudAvailable ? 'default' : 'secondary'} className="text-xs">
          {cloudAvailable ? 'Available' : 'Unavailable'}
        </Badge>
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
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
            <span className="text-muted-foreground">{runtimeStatus}</span>
          </div>
          <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onConnect}
              disabled={!cloudAvailable || cloudInitializing}
            >
              {cloudInitializing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {sessionId ? 'Reconnect' : 'Connect'}
            </Button>
          </div>
        </div>
      </div>

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
