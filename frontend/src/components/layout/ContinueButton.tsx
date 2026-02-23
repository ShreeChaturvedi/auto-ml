/**
 * ContinueButton - Button to complete current phase and unlock next phase
 *
 * Props:
 * - currentPhase: The phase being completed
 * - projectId: Active project ID
 * - disabled: Optional, disables the button
 * - className: Optional additional styles
 */

import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/stores/projectStore';
import type { Phase } from '@/types/phase';
import { getNextPhase, phaseConfig } from '@/types/phase';
import { cn } from '@/lib/utils';

interface ContinueButtonProps {
  currentPhase: Phase;
  projectId: string;
  disabled?: boolean;
  className?: string;
}

export function ContinueButton({
  currentPhase,
  projectId,
  disabled = false,
  className
}: ContinueButtonProps) {
  const navigate = useNavigate();
  const completePhase = useProjectStore((state) => state.completePhase);

  const nextPhase = getNextPhase(currentPhase);

  if (!nextPhase) {
    // This is the last phase, show completion message
    return (
      <Button
        size="default"
        disabled
        className={cn('gap-2', className)}
      >
        Workflow Complete
      </Button>
    );
  }

  const handleContinue = () => {
    // Complete current phase (also unlocks next phase)
    completePhase(projectId, currentPhase);

    // Navigate to next phase (App.tsx will sync currentPhase from URL)
    navigate(`/project/${projectId}/${nextPhase}`);
  };

  return (
    <Button
      variant="secondary"
      size="default"
      onClick={handleContinue}
      disabled={disabled}
      className={cn('gap-2', className)}
    >
      {phaseConfig[nextPhase].label}
      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}
