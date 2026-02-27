import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PlanSelector } from '@/components/layout/PlanSelector';

import { Input } from '@/components/ui/input';
import type { Project } from '@/types/project';

interface ProjectHeaderProps {
  project: Project;
  editable?: boolean;
  collapsed?: boolean;
  collapsedCenterLabel?: string;
  onBack?: () => void;
  onUpdate?: (updates: Partial<Pick<Project, 'title' | 'description'>>) => void;
}

const SAVE_DEBOUNCE_MS = 500;

export function ProjectHeader({
  project,
  editable = false,
  collapsed = false,
  collapsedCenterLabel,
  onBack,
  onUpdate
}: ProjectHeaderProps) {
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? '');
  const descriptionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setDescriptionDraft(project.description ?? '');
  }, [project.description]);

  useEffect(() => {
    return () => {
      if (descriptionTimerRef.current) {
        window.clearTimeout(descriptionTimerRef.current);
      }
    };
  }, []);

  const scheduleDescriptionSave = (nextDescription: string) => {
    if (!onUpdate) return;
    if (descriptionTimerRef.current) {
      window.clearTimeout(descriptionTimerRef.current);
    }

    descriptionTimerRef.current = window.setTimeout(() => {
      onUpdate({ description: nextDescription.trim() || undefined });
      descriptionTimerRef.current = null;
    }, SAVE_DEBOUNCE_MS);
  };

  const flushDescriptionSave = () => {
    if (!onUpdate) return;
    if (descriptionTimerRef.current) {
      window.clearTimeout(descriptionTimerRef.current);
      descriptionTimerRef.current = null;
    }
    onUpdate({ description: descriptionDraft.trim() || undefined });
  };

  if (collapsed) {
    const compactDescription = project.description?.trim() || project.title;

    return (
      <div className="h-14 shrink-0 border-b border-border bg-card/50 px-4 backdrop-blur-sm transition-all duration-300 sm:px-8">
        <div className="relative flex h-full items-center gap-3 overflow-hidden">
          {onBack ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Exit Planning
            </Button>
          ) : null}

          <div className="min-w-0 flex-1 text-right md:text-left">
            {compactDescription ? <p className="truncate text-sm text-muted-foreground">{compactDescription}</p> : null}
          </div>

          {collapsedCenterLabel ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
              <p className="text-xs font-semibold tracking-[0.02em] text-muted-foreground">
                {collapsedCenterLabel}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="h-14 shrink-0 border-b border-border bg-card/50 px-4 backdrop-blur-sm transition-all duration-300 sm:px-8">
      <div className="flex h-full items-center gap-3">
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Exit Planning
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <Input
            value={descriptionDraft}
            onChange={(event) => {
              setDescriptionDraft(event.target.value);
              scheduleDescriptionSave(event.target.value);
            }}
            onBlur={flushDescriptionSave}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                flushDescriptionSave();
              }
              if (event.key === 'Escape') {
                setDescriptionDraft(project.description ?? '');
                if (descriptionTimerRef.current) {
                  window.clearTimeout(descriptionTimerRef.current);
                  descriptionTimerRef.current = null;
                }
              }
            }}
            placeholder="Add a description"
            disabled={!editable}
            className="h-9 border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="hidden shrink-0 items-center md:flex">
          <PlanSelector
            className="h-8 w-[320px] justify-start bg-background/50 opacity-90 backdrop-blur-sm hover:bg-background hover:opacity-100"
            menuAlign="end"
            nameMaxWidthClass="max-w-[250px]"
            menuContentClassName="w-[320px]"
          />
        </div>
      </div>
    </div>
  );
}
