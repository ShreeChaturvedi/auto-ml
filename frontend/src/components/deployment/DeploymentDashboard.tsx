import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Plus, Square, Play, Loader2, MoreHorizontal, RotateCcw, Trash2,
  LayoutDashboard, FlaskConical, Code, ScrollText, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useDeploymentStore } from '@/stores/deploymentStore';
import { useModelStore } from '@/stores/modelStore';
import { getDeploymentWSClient } from '@/lib/websocket/deploymentClient';
import { IconModeToggle, type IconModeToggleOption } from '@/components/data/IconModeToggle';
import {
  COMPACT_TOOLBAR_GROUP_CLASS,
  COMPACT_TOOLBAR_ICON_BUTTON_CLASS,
  compactToolbarSelectClass,
} from '@/components/agentic/toolbarStyles';
import type { DeploymentStatus } from '@/types/deployment';
import { statusDotColor, PULSE_STATUSES } from './statusHelpers';
import { DeploymentDetail } from './DeploymentDetail';
import { DeploymentEmptyState } from './DeploymentEmptyState';
import { cn } from '@/lib/utils';

/* ── Tab options for IconModeToggle ─────────────────────────── */

type TabId = 'overview' | 'playground' | 'api' | 'logs' | 'monitoring';

const TAB_OPTIONS = [
  { value: 'overview',   ariaLabel: 'Overview',   icon: LayoutDashboard, tooltip: 'Overview' },
  { value: 'playground', ariaLabel: 'Playground',  icon: FlaskConical,    tooltip: 'Playground' },
  { value: 'api',        ariaLabel: 'API',         icon: Code,            tooltip: 'API' },
  { value: 'logs',       ariaLabel: 'Logs',        icon: ScrollText,      tooltip: 'Logs' },
  { value: 'monitoring', ariaLabel: 'Monitoring',  icon: Activity,        tooltip: 'Monitoring' },
] as const satisfies readonly IconModeToggleOption<TabId>[];

/* ── Inline status dot ──────────────────────────────────────── */

function StatusDot({ status }: { status: DeploymentStatus }) {
  const color = statusDotColor(status);
  const pulse = PULSE_STATUSES.has(status);
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse && <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', color)} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

/* ── Main component ─────────────────────────────────────────── */

export function DeploymentDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    deployments, selectedDeploymentId, isLoading,
    refreshDeployments, selectDeployment, stop, start, restart, remove,
  } = useDeploymentStore();
  const refreshModels = useModelStore(s => s.refreshModels);

  const selected = deployments.find(d => d.deploymentId === selectedDeploymentId);

  /* ---- tab state via URL ---- */
  const activeTab = (searchParams.get('section') as TabId) || 'overview';
  const setTab = (tab: TabId) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'overview') next.delete('section');
      else next.set('section', tab);
      return next;
    });
  };

  /* ---- button state ---- */
  const isTransitioning = selected && ['creating', 'starting', 'stopping'].includes(selected.status);
  const isRunning = selected && ['healthy', 'unhealthy'].includes(selected.status);
  const canStart = selected && ['stopped', 'failed'].includes(selected.status);

  /* ---- lifecycle ---- */
  useEffect(() => {
    if (projectId) {
      refreshDeployments(projectId);
      refreshModels(projectId);
    }
  }, [projectId, refreshDeployments, refreshModels]);

  useEffect(() => {
    const wsClient = getDeploymentWSClient();
    wsClient.connect().catch(() => {});
    const unsubscribe = wsClient.onEvent(event => {
      if (event.type === 'status_change') {
        useDeploymentStore.getState().updateDeploymentStatus(event.deploymentId, event.status, event.errorMessage);
        if (event.status === 'failed') toast.error('Deployment failed');
      }
      if (event.type === 'health_update' && event.healthy) {
        useDeploymentStore.getState().updateDeploymentStatus(event.deploymentId, 'healthy');
      }
    });
    return () => { unsubscribe(); wsClient.disconnect(); };
  }, []);

  useEffect(() => {
    if (!selectedDeploymentId) return;
    const wsClient = getDeploymentWSClient();
    wsClient.subscribe(selectedDeploymentId);
    return () => { wsClient.unsubscribe(selectedDeploymentId); };
  }, [selectedDeploymentId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && projectId) {
        refreshDeployments(projectId);
        getDeploymentWSClient().connect().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [projectId, refreshDeployments]);

  /* ---- action handlers ---- */
  const handleStop = async () => {
    if (!selected) return;
    try { await stop(selected.deploymentId); toast.success('Deployment stopped'); }
    catch { toast.error('Failed to stop deployment'); }
  };

  const handleStart = async () => {
    if (!selected) return;
    try { await start(selected.deploymentId); toast.success('Deployment started'); }
    catch { toast.error('Failed to start deployment'); }
  };

  const handleRestart = async () => {
    if (!selected) return;
    try { await restart(selected.deploymentId); toast.success('Deployment restarted'); }
    catch { toast.error('Failed to restart deployment'); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleteOpen(false);
    try { await remove(selected.deploymentId); toast.success('Deployment deleted'); }
    catch { toast.error('Failed to delete deployment'); }
  };

  /* ---- loading ---- */
  if (isLoading && deployments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  /* ---- empty state ---- */
  if (deployments.length === 0) return <DeploymentEmptyState />;

  /* ---- main view ---- */
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Ribbon ─────────────────────────────────────────── */}
      <div className="flex h-14 items-center justify-between gap-3 border-b px-3 shrink-0">
        {/* Left group */}
        <div className={COMPACT_TOOLBAR_GROUP_CLASS}>
          <Select
            value={selectedDeploymentId ?? undefined}
            onValueChange={id => selectDeployment(id)}
          >
            <SelectTrigger className={compactToolbarSelectClass('w-[200px]')}>
              {selected ? (
                <span className="truncate">{selected.name}</span>
              ) : (
                <SelectValue placeholder="Select deployment" />
              )}
            </SelectTrigger>
            <SelectContent>
              {deployments.map(d => (
                <SelectItem key={d.deploymentId} value={d.deploymentId}>
                  <span className="flex items-center gap-2">
                    <StatusDot status={d.status} />
                    <span className="truncate">{d.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Deploy button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                onClick={() => navigate(`/project/${projectId}/experiments`)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="sr-only">Deploy new model</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Deploy new model</TooltipContent>
          </Tooltip>

          {/* Stop / Start / Transitioning button */}
          {selected && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}
                  disabled={!!isTransitioning}
                  onClick={() => {
                    if (isRunning) void handleStop();
                    else if (canStart) void handleStart();
                  }}
                >
                  {isTransitioning
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : isRunning
                      ? <Square className="h-3.5 w-3.5" />
                      : <Play className="h-3.5 w-3.5" />}
                  <span className="sr-only">
                    {isTransitioning ? 'Transitioning' : isRunning ? 'Stop' : 'Start'}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isTransitioning ? 'Transitioning…' : isRunning ? 'Stop' : 'Start'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Overflow menu */}
          {selected && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {isRunning && (
                  <DropdownMenuItem onClick={() => void handleRestart()}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restart
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Right group — IconModeToggle */}
        <IconModeToggle<TabId>
          value={activeTab}
          onValueChange={setTab}
          options={TAB_OPTIONS}
        />
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      {selected && <DeploymentDetail deployment={selected} activeTab={activeTab} />}

      {/* ── Delete dialog ──────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete deployment</DialogTitle>
            <DialogDescription>
              This will permanently remove &quot;{selected?.name}&quot; and its associated resources.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
