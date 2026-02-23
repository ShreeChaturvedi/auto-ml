/**
 * ProjectIconList - Collapsed view of projects on homepage
 *
 * CRITICAL for collapse animation:
 * - Matches ProjectItem sizing exactly (px-2 py-1.5, h-7 w-7 icon container)
 * - Text shrinks to 0 width when collapsed, maintaining row height
 * - Uses same structure as ProjectList for consistency
 */

import { useNavigate } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses } from '@/types/project';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip';

interface ProjectIconListProps {
    onToggleCollapse?: () => void;
}

export function ProjectIconList({ onToggleCollapse }: ProjectIconListProps) {
    const navigate = useNavigate();
    const projects = useProjectStore((state) => state.projects);
    const setActiveProject = useProjectStore((state) => state.setActiveProject);

    const handleProjectClick = (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation();
        setActiveProject(projectId);
        navigate(`/project/${projectId}`);
    };

    return (
        <div className="space-y-1">
            {/* Header with expand button - same structure as PhaseList */}
            <div className="flex items-center gap-1 px-2 py-1">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
                    className="flex items-center gap-1 hover:bg-muted/50 rounded transition-colors"
                >
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="h-6 w-6 flex items-center justify-center shrink-0">
                                    <PanelLeft className="h-4 w-4" />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p>Expand sidebar</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </button>
            </div>

            {/* Project items - analogous to PhaseList collapsed items */}
            <div className="space-y-0.5">
                {projects.map((project) => {
                    const colorClasses = projectColorClasses[project.color];
                    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
                        project.icon
                    ];

                    return (
                        <TooltipProvider key={project.id} delayDuration={300}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    {/* Same structure as PhaseList - left aligned, no centering */}
                                    <button
                                        onClick={(e) => handleProjectClick(e, project.id)}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-accent/50"
                                    >
                                        {/* Icon container - h-7 w-7 like ProjectItem */}
                                        <div
                                            className={cn(
                                                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
                                                colorClasses.bg,
                                                colorClasses.text
                                            )}
                                        >
                                            {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
                                        </div>
                                        {/* Text at 0 width - maintains row height */}
                                        <span className="w-0 overflow-hidden opacity-0 text-sm font-medium">
                                            {project.title}
                                        </span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                    <p>{project.title}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                })}
            </div>
        </div>
    );
}
