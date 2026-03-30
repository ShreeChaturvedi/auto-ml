import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface FeatureApprovalGateProps {
  isApproved: boolean;
  isReadyForApproval: boolean;
  panelError: string | null;
  agentError: string | null;
  onApprove: () => void;
  onNewDraft: () => void;
}

export function FeatureApprovalGate({
  isApproved,
  isReadyForApproval,
  panelError,
  agentError,
  onApprove,
  onNewDraft
}: FeatureApprovalGateProps) {
  return (
    <div className="space-y-4 pb-4">
      <Card
        className={cn(
          'border',
          isApproved ? 'border-emerald-300 bg-emerald-50/70' : 'border-muted bg-muted/30'
        )}
      >
        <CardContent className="flex items-start justify-between gap-4 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isApproved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Info className="h-4 w-4 text-muted-foreground" />
              )}
              <p className="text-sm font-semibold">
                {isApproved ? 'Pipeline Locked' : 'Pipeline Status'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {isApproved
                ? 'This pipeline version is locked. Start a new draft to continue editing.'
                : 'Optionally lock this pipeline version when you are satisfied with the features. Training can proceed either way.'}
            </p>
          </div>
          <div className="shrink-0">
            {isApproved ? (
              <Button variant="outline" size="sm" onClick={onNewDraft}>
                Start New Draft
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={!isReadyForApproval} onClick={onApprove}>
                Lock Pipeline
              </Button>
            )}
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
