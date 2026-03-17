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
                {isApproved ? 'Pipeline Approved' : 'Approval Gate: Readiness Review'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {isApproved
                ? 'This feature engineering pipeline is locked and ready for training.'
                : 'Enable features and review readiness evidence before approval.'}
            </p>
          </div>
          <div className="shrink-0">
            {isApproved ? (
              <Button variant="outline" size="sm" onClick={onNewDraft}>
                Start New Draft
              </Button>
            ) : (
              <Button size="sm" disabled={!isReadyForApproval} onClick={onApprove}>
                Approve Pipeline
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
