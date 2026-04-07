import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Pause, Play, MoreVertical, Trash2, ExternalLink } from 'lucide-react';
import type { DeploymentRecord, DeploymentStatus } from '@/types/deployment';
import { useDeploymentStore } from '@/stores/deploymentStore';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';
import { PlaygroundTab } from './tabs/PlaygroundTab';
import { ApiTab } from './tabs/ApiTab';
import { LogsTab } from './tabs/LogsTab';
import { MonitoringTab } from './tabs/MonitoringTab';
import { statusLabel, statusDotColor, statusBadgeVariant, PULSE_STATUSES } from './statusHelpers';

const TABS = ['overview', 'playground', 'api', 'logs', 'monitoring'] as const;
type TabId = (typeof TABS)[number];

const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  playground: 'Playground',
  api: 'API',
  logs: 'Logs',
  monitoring: 'Monitoring',
};

// ---------------------------------------------------------------------------
// Status dot component
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: DeploymentStatus }) {
  const color = statusDotColor(status);
  const pulse = PULSE_STATUSES.has(status);

  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && (
        <span
          className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', color)}
        />
      )}
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', color)} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// DeploymentDetail
// ---------------------------------------------------------------------------

export function DeploymentDetail({ deployment }: { deployment: DeploymentRecord }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { start, stop, remove } = useDeploymentStore();
  const { colorClasses } = useProjectThemeColor();

  const activeTab = (searchParams.get('section') as TabId) || 'overview';
  const setTab = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'overview') next.delete('section');
      else next.set('section', tab);
      return next;
    });
  };

  const isRunning = deployment.status === 'healthy' || deployment.status === 'starting';
  const canStart = deployment.status === 'stopped' || deployment.status === 'failed';

  const handleToggle = () => {
    if (isRunning) stop(deployment.deploymentId);
    else if (canStart) start(deployment.deploymentId);
  };

  const handleDelete = () => {
    remove(deployment.deploymentId);
    setDeleteOpen(false);
  };

  const handleCopy = () => {
    if (deployment.endpointUrl) navigator.clipboard.writeText(deployment.endpointUrl);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b px-5 py-3">
        <StatusDot status={deployment.status} />
        <h2 className={cn('text-base font-semibold truncate', colorClasses?.text)}>{deployment.name}</h2>
        <Badge variant={statusBadgeVariant(deployment.status)} className="ml-1 text-xs capitalize">
          {statusLabel(deployment.status)}
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant={isRunning ? 'outline' : 'default'} onClick={handleToggle} disabled={!isRunning && !canStart}>
            {isRunning ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            {isRunning ? 'Pause' : 'Start'}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete deployment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-5 mt-3 w-fit">
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {TAB_LABELS[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* Endpoint */}
            <div className="rounded-lg border p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Endpoint</p>
              {deployment.endpointUrl ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs font-mono">
                    {deployment.endpointUrl}
                  </code>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCopy}>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="sr-only">Copy endpoint URL</span>
                  </Button>
                  <a
                    href={deployment.endpointUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="sr-only">Open endpoint</span>
                  </a>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Not available</p>
              )}
            </div>

            {/* Model */}
            <div className="rounded-lg border p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Model</p>
              <p className="text-sm font-medium truncate">{deployment.modelId}</p>
            </div>

            {/* Status */}
            <div className="rounded-lg border p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Status</p>
              <div className="flex items-center gap-2">
                <StatusDot status={deployment.status} />
                <span className="text-sm font-medium capitalize">{statusLabel(deployment.status)}</span>
              </div>
              {deployment.errorMessage && (
                <p className="mt-1 text-xs text-destructive">{deployment.errorMessage}</p>
              )}
            </div>

            {/* Created */}
            <div className="rounded-lg border p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Created</p>
              <p className="text-sm">{new Date(deployment.createdAt).toLocaleString()}</p>
            </div>

            {/* Last updated */}
            <div className="rounded-lg border p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Last Updated</p>
              <p className="text-sm">{new Date(deployment.updatedAt).toLocaleString()}</p>
            </div>

            {deployment.stoppedAt && (
              <div className="rounded-lg border p-4">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Stopped At</p>
                <p className="text-sm">{new Date(deployment.stoppedAt).toLocaleString()}</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="playground" className="flex-1 overflow-y-auto px-5 py-4">
          <PlaygroundTab deployment={deployment} />
        </TabsContent>

        <TabsContent value="api" className="flex-1 overflow-y-auto px-5 py-4">
          <ApiTab deployment={deployment} />
        </TabsContent>

        <TabsContent value="logs" className="flex-1 overflow-y-auto px-5 py-4">
          <LogsTab deployment={deployment} />
        </TabsContent>

        <TabsContent value="monitoring" className="flex-1 overflow-y-auto px-5 py-4">
          <MonitoringTab deployment={deployment} />
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete deployment</DialogTitle>
            <DialogDescription>
              This will permanently remove &quot;{deployment.name}&quot; and its associated resources.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
