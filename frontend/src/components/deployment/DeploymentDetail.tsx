import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useModelStore } from '@/stores/modelStore';
import { COMPACT_TOOLBAR_ICON_BUTTON_CLASS } from '@/components/agentic/toolbarStyles';
import type { DeploymentRecord } from '@/types/deployment';
import { statusLabel, statusDotColor, PULSE_STATUSES } from './statusHelpers';
import { timeAgo } from './deploymentUtils';
import { PlaygroundTab } from './tabs/PlaygroundTab';
import { ApiTab } from './tabs/ApiTab';
import { LogsTab } from './tabs/LogsTab';
import { MonitoringTab } from './tabs/MonitoringTab';
import { cn } from '@/lib/utils';

type TabId = 'overview' | 'playground' | 'api' | 'logs' | 'monitoring';

interface Props {
  deployment: DeploymentRecord;
  activeTab: TabId;
}

/* ── Helpers ────────────────────────────────────────────────── */

function RelativeTime({ date, prefix }: { date: string; prefix?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm text-foreground cursor-default">
          {prefix ? `${prefix} ` : ''}{timeAgo(date)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{new Date(date).toLocaleString()}</TooltipContent>
    </Tooltip>
  );
}

/* ── Overview content ───────────────────────────────────────── */

function OverviewContent({ deployment }: { deployment: DeploymentRecord }) {
  const model = useModelStore(s => s.models.find(m => m.modelId === deployment.modelId));
  const dotColor = statusDotColor(deployment.status);
  const pulse = PULSE_STATUSES.has(deployment.status);

  const handleCopy = async () => {
    if (!deployment.endpointUrl) return;
    try {
      await navigator.clipboard.writeText(deployment.endpointUrl);
      toast.success('Copied endpoint URL');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero status section */}
      <div className="rounded-xl border bg-muted/30 p-5 space-y-3">
        {/* Status row */}
        <div className="flex items-center gap-2.5">
          <span className="relative inline-flex h-3 w-3 shrink-0">
            {pulse && <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', dotColor)} />}
            <span className={cn('relative inline-flex h-3 w-3 rounded-full', dotColor)} />
          </span>
          <span className="text-sm font-medium capitalize">{statusLabel(deployment.status)}</span>
          {deployment.status === 'healthy' && (
            <span className="text-xs text-muted-foreground">
              for {timeAgo(deployment.updatedAt)}
            </span>
          )}
          {deployment.errorMessage && (
            <span className="text-xs text-destructive ml-auto truncate max-w-[50%]">{deployment.errorMessage}</span>
          )}
        </div>

        {/* Endpoint URL */}
        {deployment.endpointUrl ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background/60 border border-border/50 px-2.5 py-1.5 text-xs font-mono text-foreground">
              {deployment.endpointUrl}
            </code>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={COMPACT_TOOLBAR_ICON_BUTTON_CLASS} onClick={() => void handleCopy()}>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="sr-only">Copy endpoint URL</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy URL</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={deployment.endpointUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent h-7 w-7"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="sr-only">Open endpoint</span>
                </a>
              </TooltipTrigger>
              <TooltipContent>Open in browser</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Endpoint not available yet</p>
        )}
      </div>

      {/* Details section */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-xs text-muted-foreground uppercase tracking-wider">Model</dt>
        <dd className="text-sm text-foreground truncate">
          {model ? model.name : deployment.modelId.slice(0, 12) + '…'}
          {model?.algorithm && (
            <span className="ml-1.5 text-xs text-muted-foreground">({model.algorithm})</span>
          )}
        </dd>

        {model?.taskType && (
          <>
            <dt className="text-xs text-muted-foreground uppercase tracking-wider">Task Type</dt>
            <dd className="text-sm text-foreground capitalize">{model.taskType}</dd>
          </>
        )}

        <dt className="text-xs text-muted-foreground uppercase tracking-wider">Created</dt>
        <dd><RelativeTime date={deployment.createdAt} /></dd>

        <dt className="text-xs text-muted-foreground uppercase tracking-wider">Last Updated</dt>
        <dd><RelativeTime date={deployment.updatedAt} /></dd>

        {deployment.stoppedAt && (
          <>
            <dt className="text-xs text-muted-foreground uppercase tracking-wider">Stopped At</dt>
            <dd><RelativeTime date={deployment.stoppedAt} /></dd>
          </>
        )}
      </dl>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────── */

export function DeploymentDetail({ deployment, activeTab }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {activeTab === 'overview' && <OverviewContent deployment={deployment} />}
      {activeTab === 'playground' && <PlaygroundTab deployment={deployment} />}
      {activeTab === 'api' && <ApiTab deployment={deployment} />}
      {activeTab === 'logs' && <LogsTab deployment={deployment} />}
      {activeTab === 'monitoring' && <MonitoringTab deployment={deployment} />}
    </div>
  );
}
