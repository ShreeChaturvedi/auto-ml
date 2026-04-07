import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Sparkles } from 'lucide-react';

interface TrainingApprovalGateProps {
  totalModels: number;
  selectedModels: number;
  isGenerating: boolean;
  isSubmitted: boolean;
  onApply: () => void;
}

export function TrainingApprovalGate({
  totalModels,
  selectedModels,
  isGenerating,
  isSubmitted,
  onApply
}: TrainingApprovalGateProps) {
  const hasSelections = selectedModels > 0;
  const canApply = hasSelections && !isGenerating && !isSubmitted;
  const modelLabel = totalModels === 1 ? 'model' : 'models';

  return (
    <div className="space-y-4 pb-4">
      <Card className="border-muted bg-muted/30">
        <CardContent className="flex items-start justify-between gap-4 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-600" />
              <p className="text-sm font-semibold">
                {isSubmitted ? 'Training Approval Sent' : 'Approve Model Training'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {isSubmitted
                ? isGenerating
                  ? 'Working through the approved model set now.'
                  : 'The selected models were applied to this training run.'
                : hasSelections
                  ? `${selectedModels} of ${totalModels} ${modelLabel} selected. Apply these choices to continue training.`
                  : `Select one or more proposed ${modelLabel} above to continue training.`}
            </p>
          </div>
          <div className="shrink-0">
            <Button size="sm" disabled={!canApply} onClick={onApply}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Working
                </>
              ) : isSubmitted ? (
                'Applied'
              ) : (
                `Apply ${selectedModels} Selected`
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
