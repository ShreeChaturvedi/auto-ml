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
  const isSingleModelFlow = totalModels <= 1;

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
                  ? 'Training the selected model now. After it registers, continue in this chat to launch the next proposed model.'
                  : 'The selected model was applied to this training run. After it registers, continue in this chat to launch the next proposed model.'
                : hasSelections
                  ? isSingleModelFlow
                    ? '1 of 1 model selected. Apply this choice to continue training.'
                    : `${selectedModels} of ${totalModels} models selected. Only 1 model can be trained at a time. Apply one choice now, then continue in this chat after that model is registered to launch the next one.`
                  : isSingleModelFlow
                    ? 'Select the proposed model above to continue training.'
                    : 'Select exactly 1 proposed model above. Only 1 model can be trained at a time, and you can continue in this chat after it is registered.'}
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
                selectedModels === 1 ? 'Train Selected Model' : `Train ${selectedModels} Selected`
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
