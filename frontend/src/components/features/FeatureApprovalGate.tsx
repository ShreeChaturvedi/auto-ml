import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';

interface FeatureApprovalGateProps {
  activeFeaturesCount: number;
  implementedFeaturesCount: number;
  isGenerating: boolean;
  panelError: string | null;
  agentError: string | null;
  onImplement: () => void;
}

export function FeatureApprovalGate({
  activeFeaturesCount,
  implementedFeaturesCount,
  isGenerating,
  panelError,
  agentError,
  onImplement
}: FeatureApprovalGateProps) {
  const pendingFeaturesCount = Math.max(activeFeaturesCount - implementedFeaturesCount, 0);
  const canImplement = activeFeaturesCount > 0 && !isGenerating;

  return (
    <div className="space-y-4 pb-4">
      <Card
        className={cn(
          'border',
          activeFeaturesCount > 0 ? 'border-sky-300/70 bg-sky-50/60' : 'border-muted bg-muted/30'
        )}
      >
        <CardContent className="flex items-start justify-between gap-4 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-600" />
              <p className="text-sm font-semibold">
                {activeFeaturesCount === 0 ? 'Choose Features To Build' : 'Build Enabled Features'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {activeFeaturesCount === 0
                ? 'Enable one or more proposed features. Then generate notebook steps to write, run, and validate them in this draft.'
                : pendingFeaturesCount > 0
                  ? `${pendingFeaturesCount} enabled feature${pendingFeaturesCount === 1 ? '' : 's'} still need notebook steps.`
                  : 'The enabled features already have notebook work in this draft. Generate notebook steps again after changing selections or parameters.'}
            </p>
          </div>
          <div className="shrink-0">
            <Button size="sm" disabled={!canImplement} onClick={onImplement}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Working
                </>
              ) : (
                activeFeaturesCount === 0 || pendingFeaturesCount > 0
                  ? 'Generate Notebook Steps'
                  : 'Update Notebook Steps'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {panelError || agentError ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="flex items-center gap-2 py-3 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {panelError ?? agentError}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
