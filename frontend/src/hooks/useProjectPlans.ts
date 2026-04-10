/**
 * useProjectPlans — shared hook for plan metadata, open, create, rename, and delete actions.
 * Used by both PlanSubtabs (sidebar) and FileExplorer (panel).
 */

import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/stores/projectStore';

/** Read `activePlanChatId` from a project's metadata. Returns null if absent/empty. */
export function getActivePlanChatId(metadata: Record<string, unknown> | undefined): string | null {
  const val = metadata?.activePlanChatId;
  return typeof val === 'string' && val.length > 0 ? val : null;
}

/** Zustand selector: reactive `activePlanChatId` for a given project. */
export function selectActivePlanChatId(projectId: string | null | undefined) {
  return (s: { projects: Array<{ id: string; metadata?: unknown }> }): string | null => {
    if (!projectId) return null;
    const project = s.projects.find((p) => p.id === projectId);
    return getActivePlanChatId(project?.metadata as Record<string, unknown> | undefined);
  };
}

export interface ProjectPlan {
  id: string;
  name: string;
  content: string;
}

export interface UseProjectPlansReturn {
  plans: ProjectPlan[];
  selectedPlanId: string | undefined;
  handleOpenPlan: (planId: string) => void;
  handleCreateNewPlan: (e?: React.MouseEvent) => void;
  handleRenamePlan: (planId: string, newName: string) => void;
  handleDeletePlan: (planId: string) => void;
}

export function useProjectPlans(projectId: string): UseProjectPlansReturn {
  const navigate = useNavigate();
  const updateProject = useProjectStore((s) => s.updateProject);
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));

  const metadata = useMemo(
    () => (project?.metadata ?? {}) as Record<string, unknown>,
    [project?.metadata]
  );

  const plans = useMemo<ProjectPlan[]>(() => {
    const plansArray = Array.isArray(metadata.plans)
      ? (metadata.plans as ProjectPlan[])
      : [];
    const legacyName = metadata.projectPlanName as string | undefined;
    const legacyContent = metadata.projectPlan as string | undefined;
    if (plansArray.length === 0 && legacyName && legacyContent) {
      return [{ id: `plan-${legacyName}`, name: legacyName, content: legacyContent }];
    }
    return plansArray;
  }, [metadata]);

  const activePlanId = metadata.activePlanId as string | undefined;
  const selectedPlanId = activePlanId ?? plans[0]?.id;

  const handleOpenPlan = useCallback(
    (planId: string) => {
      const selectedPlan = plans.find((p) => p.id === planId);
      void updateProject(projectId, {
        metadata: {
          ...metadata,
          activePlanId: planId,
          activePlanChatId: null,
          projectPlanName: selectedPlan?.name,
          projectPlan: selectedPlan?.content,
          uploadStage: 'upload',
        },
      });
      navigate(`/project/${projectId}/upload?planId=${planId}`);
    },
    [projectId, updateProject, metadata, navigate, plans]
  );

  const handleCreateNewPlan = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      navigate(`/project/${projectId}/upload?newPlan=1`);
    },
    [projectId, navigate]
  );

  const handleRenamePlan = useCallback(
    (planId: string, newName: string) => {
      const updatedPlans = plans.map((p) =>
        p.id === planId ? { ...p, name: newName } : p
      );
      const renamedPlan = updatedPlans.find((p) => p.id === planId);
      const legacyCompat = planId === selectedPlanId
        ? { projectPlanName: renamedPlan?.name }
        : {};
      void updateProject(projectId, {
        metadata: { ...metadata, plans: updatedPlans, ...legacyCompat },
      });
    },
    [plans, metadata, projectId, selectedPlanId, updateProject]
  );

  const handleDeletePlan = useCallback(
    (planId: string) => {
      const remaining = plans.filter((p) => p.id !== planId);
      const nextSelected = remaining[0];
      const legacyCompat = nextSelected
        ? {
            activePlanId: nextSelected.id,
            projectPlanName: nextSelected.name,
            projectPlan: nextSelected.content,
          }
        : {
            activePlanId: null,
            projectPlanName: '',
            projectPlan: '',
          };
      void updateProject(projectId, {
        metadata: {
          ...metadata,
          plans: remaining,
          ...legacyCompat,
        },
      });
    },
    [plans, metadata, projectId, updateProject]
  );

  return { plans, selectedPlanId, handleOpenPlan, handleCreateNewPlan, handleRenamePlan, handleDeletePlan };
}
