/**
 * ProjectDialog - Create/Edit project dialog
 *
 * Features:
 * - Form with React Hook Form + Zod validation
 * - Title input with icon preview
 * - Animated placeholder description textarea with auto-resize
 * - Circular color swatches with custom color picker (react-colorful)
 * - Icon selector (from lucide-react)
 * - Handles both create and edit modes
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HexColorPicker } from 'react-colorful';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnimatedPlaceholderTextarea } from '@/components/ui/animated-placeholder-textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useProjectStore } from '@/stores/projectStore';
import type { Project, ProjectColor } from '@/types/project';
import { resolveProjectColor } from '@/types/project';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const projectFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(50, 'Title must be less than 50 characters'),
  description: z.string().max(200, 'Description must be less than 200 characters').optional(),
  icon: z.string().min(1, 'Icon is required'),
  color: z.enum([
    'blue', 'green', 'purple', 'pink', 'orange',
    'red', 'yellow', 'indigo', 'teal', 'cyan', 'custom'
  ]),
  customColor: z.string().optional()
}).refine(
  (data) => data.color !== 'custom' || (data.customColor && /^#[0-9a-fA-F]{6}$/.test(data.customColor)),
  { message: 'Pick a custom color', path: ['customColor'] }
);

type ProjectFormValues = z.infer<typeof projectFormSchema>;

const projectIcons = [
  'Folder', 'FolderOpen', 'Database', 'Brain',
  'Sparkles', 'Zap', 'Rocket', 'Target',
  'BarChart', 'LineChart', 'Box', 'Cpu'
];

const presetColors: Exclude<ProjectColor, 'custom'>[] = [
  'blue', 'green', 'purple', 'pink', 'orange',
  'red', 'yellow', 'indigo', 'teal', 'cyan'
];

const presetColorHex: Record<string, string> = {
  blue: '#3b82f6', green: '#22c55e', purple: '#a855f7', pink: '#ec4899',
  orange: '#f97316', red: '#ef4444', yellow: '#eab308', indigo: '#6366f1',
  teal: '#14b8a6', cyan: '#06b6d4'
};

const descriptionPlaceholders = [
  'Predict customer churn from subscription and usage patterns over the last 12 months',
  'Classify plant disease from leaf photos using a fine-tuned ResNet backbone',
  'Sentiment analysis on Amazon product reviews to surface common complaints',
  'Forecast weekly retail sales across 50 stores using weather and holiday features',
  'Detect fraudulent credit-card transactions in a highly imbalanced dataset',
  'Build a collaborative-filtering recommender for a movie streaming catalog',
  'Segment MRI brain scans to identify tumor regions for radiology triage',
  'Predict 30-day hospital readmission risk from patient discharge records',
  'Classify support tickets by urgency and route them to the right team',
  'Estimate housing prices from neighborhood demographics and listing features',
];

const RAINBOW_GRADIENT = 'conic-gradient(in oklch longer hue, oklch(0.7 0.15 0), oklch(0.7 0.15 360))';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
}

export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();

  const isEditMode = !!project;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      title: project?.title || '',
      description: project?.description || '',
      icon: project?.icon || 'Folder',
      color: project?.color || 'blue',
      customColor: project?.customColor || undefined
    }
  });

  useEffect(() => {
    if (open) {
      reset({
        title: project?.title || '',
        description: project?.description || '',
        icon: project?.icon || 'Folder',
        color: project?.color || 'blue',
        customColor: project?.customColor || undefined
      });
      setFormError(null);
      setIsIconPickerOpen(false);
      setIsColorPickerOpen(false);
    }
  }, [open, project, reset]);

  const selectedIcon = watch('icon');
  const selectedColor = watch('color');
  const customColor = watch('customColor');
  const descriptionValue = watch('description') ?? '';

  const onSubmit = async (data: ProjectFormValues) => {
    setFormError(null);
    try {
      const formData = {
        title: data.title,
        description: data.description,
        icon: data.icon,
        color: data.color as ProjectColor,
        customColor: data.color === 'custom' ? data.customColor : undefined
      };

      if (isEditMode && project) {
        await updateProject(project.id, formData);
      } else {
        const created = await createProject(formData);
        setActiveProject(created.id);
        navigate(`/project/${created.id}/upload`);
      }
      onOpenChange(false);
    } catch {
      setFormError('Unable to save project. Please try again.');
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isEditMode) {
      handleSubmit(onSubmit)();
      return;
    }
    onOpenChange(nextOpen);
  };

  const PreviewIcon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[selectedIcon];
  const previewColors = resolveProjectColor(selectedColor, customColor);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Project' : 'New Project'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* ── Title + Icon ─────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsIconPickerOpen(true)}
                className={cn(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-[transform,border-color] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedColor !== 'custom' && previewColors.bg,
                  selectedColor !== 'custom' && previewColors.text,
                  selectedColor !== 'custom' && previewColors.border
                )}
                style={previewColors.style}
                title="Click to change icon"
              >
                {PreviewIcon && <PreviewIcon className="h-5 w-5" />}
              </button>
              <Input id="title" className="flex-1 bg-muted/40" placeholder="Project name" {...register('title')} />
            </div>
            {errors.title && (
              <p className="mt-1.5 text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* ── Description ──────────────────────────────────────────── */}
          <div className="relative">
            <AnimatedPlaceholderTextarea
              id="description"
              placeholders={descriptionPlaceholders}
              interval={3500}
              autoResize
              rows={2}
              className="w-full resize-none bg-muted/40 pb-6"
              value={descriptionValue}
              onChange={(e) => {
                if (e.target.value.length <= 200) {
                  setValue('description', e.target.value, { shouldValidate: true });
                }
              }}
            />
            <span className={cn(
              'absolute bottom-2 right-3 text-[11px] tabular-nums',
              descriptionValue.length >= 190 ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {descriptionValue.length}/200
            </span>
            {errors.description && (
              <p className="mt-1.5 text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* ── Color ────────────────────────────────────────────────── */}
          <div className="pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-[transform,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    selectedColor === color
                      ? 'border-foreground scale-[1.15]'
                      : 'border-transparent hover:border-foreground/40 hover:scale-105'
                  )}
                  style={{ backgroundColor: presetColorHex[color] }}
                  onClick={() => {
                    setValue('color', color, { shouldValidate: true });
                    setValue('customColor', undefined);
                  }}
                  aria-label={`Select ${color} color`}
                />
              ))}

              {/* Custom color picker */}
              <Popover open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'relative h-6 w-6 rounded-full border-2 p-0 transition-[transform,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      selectedColor === 'custom'
                        ? 'border-black dark:border-white scale-[1.15]'
                        : 'border-transparent hover:border-foreground/40 hover:scale-105'
                    )}
                    aria-label="Select custom color"
                  >
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: selectedColor === 'custom' && customColor
                          ? customColor
                          : RAINBOW_GRADIENT
                      }}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" side="top">
                  <HexColorPicker
                    color={customColor || '#6366f1'}
                    onChange={(hex) => {
                      setValue('color', 'custom', { shouldValidate: true });
                      setValue('customColor', hex, { shouldValidate: true });
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {errors.customColor && (
              <p className="mt-1.5 text-xs text-destructive">{errors.customColor.message}</p>
            )}
          </div>

          {formError && (
            <p className="text-xs text-destructive">{formError}</p>
          )}

          {/* ── Footer ───────────────────────────────────────────────── */}
          {!isEditMode && (
            <DialogFooter className="pt-1">
              <Button type="submit" disabled={isSubmitting}>
                Create Project
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>

      {/* Icon Picker Dialog */}
      <Dialog open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Icon</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-2 place-items-center py-4">
            {projectIcons.map((iconName) => {
              const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => { setValue('icon', iconName); setIsIconPickerOpen(false); }}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-md border-2 border-transparent transition-[border-color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selectedIcon === iconName
                      ? 'ring-2 ring-primary bg-primary/10'
                      : 'hover:bg-accent hover:border-primary/50'
                  )}
                  title={iconName}
                >
                  {Icon && <Icon className="h-5 w-5" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
