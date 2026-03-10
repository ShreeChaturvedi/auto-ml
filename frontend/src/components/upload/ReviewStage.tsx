import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Edit3, RefreshCcw } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { Markdown } from '@/components/ui/Markdown';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface ReviewStageProps {
  plan: string;
  onBack: () => void;
  onPlanChange: (nextPlan: string) => void;
  onRequestChanges: (feedback: string) => void;
  onApprove: () => void;
}

export function ReviewStage({
  plan,
  onBack,
  onPlanChange,
  onRequestChanges,
  onApprove
}: ReviewStageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftPlan, setDraftPlan] = useState(plan);
  const [changeRequest, setChangeRequest] = useState('');

  useEffect(() => {
    setDraftPlan(plan);
  }, [plan]);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 p-4 sm:gap-6 sm:p-6" data-testid="review-stage">
      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="text-2xl">Your Project Plan</CardTitle>
          <CardDescription>
            Review the generated strategy, edit directly, or request another planning pass.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <Textarea
              value={draftPlan}
              onChange={(event) => setDraftPlan(event.target.value)}
              className="min-h-[360px] font-mono"
            />
          ) : (
            <Markdown className="max-h-[420px] overflow-y-auto rounded-md border border-border/70 p-4 text-sm">
              {plan}
            </Markdown>
          )}

          <Textarea
            value={changeRequest}
            onChange={(event) => setChangeRequest(event.target.value)}
            className="min-h-[110px]"
            placeholder="Ask for changes to the plan. Example: emphasize recall over precision and include a baseline model."
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {isEditing ? (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                onPlanChange(draftPlan);
                setIsEditing(false);
              }}
            >
              Save Edit
            </Button>
          ) : (
            <Button variant="outline" className="gap-2" onClick={() => setIsEditing(true)}>
              <Edit3 className="h-4 w-4" />
              Edit Plan
            </Button>
          )}

          <Button
            variant="outline"
            className="gap-2"
            disabled={!changeRequest.trim()}
            onClick={() => onRequestChanges(changeRequest.trim())}
          >
            <RefreshCcw className="h-4 w-4" />
            Request Changes
          </Button>

          <Button className="gap-2" onClick={onApprove}>
            <Check className="h-4 w-4" />
            Approve & Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
