import { type ComponentType, useEffect, useRef, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { Pencil } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';
import { projectColorClasses } from '@/types/project';

interface ProjectHeaderProps {
  project: Project;
  editable?: boolean;
  onUpdate?: (updates: Partial<Pick<Project, 'title' | 'description'>>) => void;
}

const SAVE_DEBOUNCE_MS = 500;

export function ProjectHeader({ project, editable = false, onUpdate }: ProjectHeaderProps) {
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

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="px-4 py-5 sm:px-8 sm:py-6">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border-2 shadow-sm sm:h-16 sm:w-16',
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
