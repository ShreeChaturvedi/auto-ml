import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjectStore } from '@/stores/projectStore';
import { cn } from '@/lib/utils';

export function PlanSelector() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const updateProject = useProjectStore((state) => state.updateProject);

  const effectiveProjectId = projectId || activeProjectId;
  const project = effectiveProjectId ? projects.find((p) => p.id === effectiveProjectId) : null;

  const metadata = useMemo(() => (project?.metadata ?? {}) as Record<string, unknown>, [project?.metadata]);
  const activePlanId = metadata.activePlanId as string | undefined;
  
  const plans = useMemo(() => {
    if (!project) return [];
    const plansArray = Array.isArray(metadata.plans) ? metadata.plans as { id: string, name: string, content: string }[] : [];
    
    // Legacy support
    const legacyPlanName = metadata.projectPlanName as string | undefined;
    const legacyPlanContent = metadata.projectPlan as string | undefined;
    
    if (plansArray.length === 0 && legacyPlanName && legacyPlanContent) {
      return [{ id: `plan-${legacyPlanName}`, name: legacyPlanName, content: legacyPlanContent }];
    }
    return plansArray;
  }, [project, metadata]);

  const handleSelectPlan = useCallback((planId: string) => {
    if (!effectiveProjectId) return;

    const selectedPlan = plans.find((plan) => plan.id === planId);

    void updateProject(effectiveProjectId, {
      metadata: {
        ...metadata,
        activePlanId: planId,
        projectPlanName: selectedPlan?.name,
        projectPlan: selectedPlan?.content,
      },
    });
  }, [effectiveProjectId, metadata, plans, updateProject]);

  const handleCreateNewPlan = useCallback(() => {
    if (!effectiveProjectId) return;

    navigate(`/project/${effectiveProjectId}/upload?newPlan=1`);
  }, [effectiveProjectId, navigate]);

  if (!project || plans.length === 0) {
    return null;
  }

  const selectedPlanId = activePlanId ?? plans[0]?.id;
  const activePlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 shadow-sm bg-background/50 backdrop-blur-sm border-border"
        >
          <ClipboardList className="h-4 w-4 text-primary" />
          <span className="max-w-[150px] truncate">{activePlan.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px]">
        {plans.map((plan) => (
          <DropdownMenuItem
            key={plan.id}
            onClick={() => handleSelectPlan(plan.id)}
            className={cn(
              "cursor-pointer",
              plan.id === selectedPlanId ? "bg-accent text-accent-foreground font-medium" : ""
            )}
          >
            <ClipboardList className="h-4 w-4 mr-2 opacity-70" />
            <span className="truncate flex-1">{plan.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCreateNewPlan} className="cursor-pointer text-primary">
          <Plus className="h-4 w-4 mr-2" />
          New plan file
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
