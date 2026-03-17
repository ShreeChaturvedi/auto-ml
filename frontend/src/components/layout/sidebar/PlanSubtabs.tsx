/**
 * PlanSubtabs — renders plan items under Data Upload phase.
 */

import { useLocation } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useProjectPlans } from '@/hooks/useProjectPlans';
import { SubtabItem } from './SubtabItem';

interface PlanSubtabsProps {
  projectId: string;
  themeColorClass: string;
}

export function PlanSubtabs({ projectId, themeColorClass }: PlanSubtabsProps) {
  const location = useLocation();
  const { plans, selectedPlanId, handleOpenPlan } = useProjectPlans(projectId);
  const isOnUpload = location.pathname.endsWith('/upload');

  if (plans.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {plans.map((plan) => (
        <SubtabItem
          key={plan.id}
          icon={ClipboardList}
          label={plan.name}
          isActive={isOnUpload && plan.id === selectedPlanId}
          themeColorClass={themeColorClass}
          onClick={() => handleOpenPlan(plan.id)}
        />
      ))}
    </div>
  );
}
