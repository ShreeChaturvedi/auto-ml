import { type ComponentType, useEffect, useRef, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { ArrowLeft, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';
import { projectColorClasses } from '@/types/project';

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
  const IconComponent = (LucideIcons as unknown as Record<string, ComponentType<{ className?: string }>>)[
    project.icon
  ] || LucideIcons.Folder;

  const [titleDraft, setTitleDraft] = useState(project.title);
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? '');
  const [editingField, setEditingField] = useState<'title' | 'description' | null>(null);

  const titleTimerRef = useRef<number | null>(null);
  const descriptionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setTitleDraft(project.title);
    setDescriptionDraft(project.description ?? '');
  }, [project.description, project.title]);

  useEffect(() => {
    return () => {
      if (titleTimerRef.current) {
        window.clearTimeout(titleTimerRef.current);
      }
      if (descriptionTimerRef.current) {
        window.clearTimeout(descriptionTimerRef.current);
      }
    };
  }, []);

  const colorClasses = projectColorClasses[project.color];

  const scheduleTitleSave = (nextTitle: string) => {
    if (!onUpdate) return;
    if (titleTimerRef.current) {
      window.clearTimeout(titleTimerRef.current);
    }

    titleTimerRef.current = window.setTimeout(() => {
      onUpdate({ title: nextTitle.trim() || project.title });
      titleTimerRef.current = null;
    }, SAVE_DEBOUNCE_MS);
  };

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

  const flushTitleSave = () => {
    if (!onUpdate) return;
    if (titleTimerRef.current) {
      window.clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    onUpdate({ title: titleDraft.trim() || project.title });
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
    <div className="border-b border-border bg-card/50 backdrop-blur-sm transition-all duration-300">
      <div className="px-4 py-5 sm:px-8 sm:py-6">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border-2 shadow-sm sm:h-16 sm:w-16 transition-all duration-300',
              colorClasses.bg,
              colorClasses.border
            )}
          >
            <IconComponent className={cn('h-7 w-7 sm:h-8 sm:w-8', colorClasses.text)} />
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            {editable && editingField === 'title' ? (
              <Input
                value={titleDraft}
                onChange={(event) => {
                  setTitleDraft(event.target.value);
                  scheduleTitleSave(event.target.value);
                }}
                onBlur={() => {
                  flushTitleSave();
                  setEditingField(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    flushTitleSave();
                    setEditingField(null);
                  }
                  if (event.key === 'Escape') {
                    setTitleDraft(project.title);
                    if (titleTimerRef.current) {
                      window.clearTimeout(titleTimerRef.current);
                      titleTimerRef.current = null;
                    }
                    setEditingField(null);
                  }
                }}
                className="h-auto border-0 bg-transparent p-0 text-3xl font-bold tracking-tight shadow-none focus-visible:ring-0"
                autoFocus
              />
            ) : (
              <button
                type="button"
                disabled={!editable}
                onClick={() => editable && setEditingField('title')}
                className={cn(
                  'group flex w-full items-center gap-2 text-left',
                  editable && 'cursor-text'
                )}
              >
                <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{project.title}</h1>
                {editable ? <Pencil className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /> : null}
              </button>
            )}

            {editable && editingField === 'description' ? (
              <Textarea
                value={descriptionDraft}
                onChange={(event) => {
                  setDescriptionDraft(event.target.value);
                  scheduleDescriptionSave(event.target.value);
                }}
                onBlur={() => {
                  flushDescriptionSave();
                  setEditingField(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setDescriptionDraft(project.description ?? '');
                    if (descriptionTimerRef.current) {
                      window.clearTimeout(descriptionTimerRef.current);
                      descriptionTimerRef.current = null;
                    }
                    setEditingField(null);
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    flushDescriptionSave();
                    setEditingField(null);
                  }
                }}
                className="min-h-[72px] border-0 bg-transparent p-0 text-base leading-relaxed text-muted-foreground shadow-none focus-visible:ring-0"
                autoFocus
              />
            ) : (
              <button
                type="button"
                disabled={!editable}
                onClick={() => editable && setEditingField('description')}
                className={cn(
                  'group flex w-full items-start gap-2 text-left',
                  editable && 'cursor-text'
                )}
              >
                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {project.description?.trim() || 'Add a short project description'}
                </p>
                {editable ? <Pencil className="mt-1 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /> : null}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
