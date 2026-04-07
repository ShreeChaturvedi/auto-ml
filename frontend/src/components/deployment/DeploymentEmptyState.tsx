import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Rocket, Crown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useModelStore } from '@/stores/modelStore';
import { useDeploymentStore } from '@/stores/deploymentStore';
import { findChampionModelId } from '@/lib/model-utils';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';
import type { ModelRecord } from '@/types/model';
import { DeploymentReadiness } from './DeploymentReadiness';
import { PRIMARY_METRIC_LABEL, formatMetric } from '@/components/experiments/utils';

/* ── Helpers ──────────────────────────────────────────────────────── */

const TASK_BADGE_CLASS: Record<string, string> = {
  classification: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  regression:     'bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

function TaskBadge({ taskType }: { taskType: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
        TASK_BADGE_CLASS[taskType] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {taskType}
    </span>
  );
}

/* ── Deploy inline form ───────────────────────────────────────────── */

interface DeployFormProps {
  model: ModelRecord;
  colorClasses?: ReturnType<typeof useProjectThemeColor>['colorClasses'];
}

function DeployForm({ model, colorClasses }: DeployFormProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { deploy, isLoading } = useDeploymentStore();
  const [name, setName] = useState(`${model.name} endpoint`);
  const [error, setError] = useState<string | null>(null);

  async function handleDeploy() {
    if (!projectId || !name.trim()) return;
    setError(null);
    try {
      await deploy(model.modelId, projectId, name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <Input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Endpoint name"
        className="h-8 text-xs"
        onKeyDown={e => { if (e.key === 'Enter') { void handleDeploy(); } }}
      />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <Button
        size="sm"
        className={cn('w-full h-8 text-xs gap-1.5', colorClasses?.bg, colorClasses?.hover, 'text-white')}
        disabled={isLoading || !name.trim()}
        onClick={() => { void handleDeploy(); }}
      >
        <Rocket className="h-3.5 w-3.5" />
        {isLoading ? 'Deploying…' : 'Deploy'}
      </Button>
    </div>
  );
}

/* ── Compact model card (browser) ─────────────────────────────────── */

interface ModelCardProps {
  model: ModelRecord;
  colorClasses?: ReturnType<typeof useProjectThemeColor>['colorClasses'];
}

function ModelCard({ model, colorClasses }: ModelCardProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { deploy, isLoading } = useDeploymentStore();
  const metricKey = model.taskType === 'regression' ? 'r2' : 'accuracy';
  const metricLabel = PRIMARY_METRIC_LABEL[model.taskType];
  const metricValue = formatMetric(model.metrics[metricKey]);

  async function handleDeploy() {
    if (!projectId) return;
    await deploy(model.modelId, projectId, `${model.name} endpoint`);
  }

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 hover:border-border transition-colors">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{model.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <TaskBadge taskType={model.taskType} />
          <span className="text-[10px] text-muted-foreground">
            {metricLabel}: <span className="font-medium text-foreground">{metricValue}</span>
          </span>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          'h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity gap-1',
          colorClasses?.text,
        )}
        disabled={isLoading}
        onClick={() => { void handleDeploy(); }}
      >
        Deploy
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────── */

export function DeploymentEmptyState() {
  const { colorClasses } = useProjectThemeColor();
  const models = useModelStore(s => s.models);
  const [showForm, setShowForm] = useState(false);

  const deployableModels = models.filter(
    m => m.status === 'completed' && (m.taskType === 'classification' || m.taskType === 'regression'),
  );

  const championId = findChampionModelId(models, ['classification', 'regression']);
  const champion = championId ? deployableModels.find(m => m.modelId === championId) : null;
  const otherModels = deployableModels.filter(m => m.modelId !== championId);

  return (
    <div className="flex h-full flex-col items-center justify-start pt-10 px-6 pb-6 overflow-y-auto">
      {/* Empty illustration */}
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60">
          <Rocket className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-semibold text-foreground">No active deployments</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose a model below to create your first endpoint.
          </p>
        </div>
      </div>

      {deployableModels.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Train a classification or regression model to enable deployment.
        </p>
      ) : (
        <div className="w-full max-w-md space-y-4">

          {/* Champion card */}
          {champion && (
            <Card className={cn('border-2', showForm ? colorClasses?.border : 'border-border/60')}>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Crown className={cn('h-3.5 w-3.5', colorClasses?.text)} />
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Champion Model
                    </CardTitle>
                  </div>
                  <TaskBadge taskType={champion.taskType} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-sm font-semibold text-foreground truncate">{champion.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {PRIMARY_METRIC_LABEL[champion.taskType]}:{' '}
                    <span className={cn('font-medium', colorClasses?.text)}>
                      {formatMetric(champion.metrics[champion.taskType === 'regression' ? 'r2' : 'accuracy'])}
                    </span>
                  </span>
                </div>

                <div className="mt-3 border-t border-border/50 pt-3">
                  <DeploymentReadiness model={champion} />
                </div>

                {showForm ? (
                  <DeployForm model={champion} colorClasses={colorClasses} />
                ) : (
                  <Button
                    size="sm"
                    className={cn('mt-3 w-full h-8 text-xs gap-1.5', colorClasses?.bg, colorClasses?.hover, 'text-white')}
                    onClick={() => setShowForm(true)}
                  >
                    <Rocket className="h-3.5 w-3.5" />
                    Deploy Champion
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Model browser */}
          {otherModels.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-0.5">
                All Models
              </p>
              <div className="space-y-1.5">
                {otherModels.map(model => (
                  <ModelCard key={model.modelId} model={model} colorClasses={colorClasses} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
