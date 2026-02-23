/**
 * PhaseList - Display all workflow phases for the active project
 * Uses shared SidebarSection component for consistent behavior
 */

import { useNavigate } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { SidebarSection, type SidebarSectionItem } from './SidebarSection';
import type { Phase } from '@/types/phase';
import { phaseConfig, getAllPhasesSorted } from '@/types/phase';
import { projectColorClasses } from '@/types/project';
import { cn } from '@/lib/utils';

interface PhaseListProps {
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

export function PhaseList({ collapsed = false, onToggleCollapse }: PhaseListProps) {
    const navigate = useNavigate();
    const activeProjectId = useProjectStore((state) => state.activeProjectId);
    const projects = useProjectStore((state) => state.projects);

    const activeProject = activeProjectId
        ? projects.find((p) => p.id === activeProjectId)
        : undefined;

    const unlockedPhases = activeProject?.unlockedPhases ?? [];
    const currentPhase = activeProject?.currentPhase;
    const allPhases = getAllPhasesSorted();

    const handlePhaseClick = (e: React.MouseEvent, phase: Phase) => {
        e.stopPropagation();
        if (activeProjectId && unlockedPhases.includes(phase)) {
            navigate(`/project/${activeProjectId}/${phase}`);
        }
    };

    // Build items array for SidebarSection
    const items: SidebarSectionItem[] = activeProject
        ? allPhases.map((phase) => {
            const config = phaseConfig[phase];
            const isUnlocked = unlockedPhases.includes(phase);
            const isActive = phase === currentPhase;

            const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
                config.icon
            ];

            return {
                id: phase,
                label: config.label,
                icon: IconComponent ? (
                    <IconComponent
                        className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            isActive && activeProject && projectColorClasses[activeProject.color]?.text
                        )}
                    />
                ) : null,
                onClick: (e) => handlePhaseClick(e, phase),
                isActive,
                isDisabled: !isUnlocked
            };
        })
        : [];

    const emptyContent = (
        <div className="px-3 py-2 text-workflow text-muted-foreground">
            Select a project to view phases
        </div>
    );

    return (
        <SidebarSection
            title="Workflow"
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
            items={items}
            emptyContent={emptyContent}
        />
    );
}
