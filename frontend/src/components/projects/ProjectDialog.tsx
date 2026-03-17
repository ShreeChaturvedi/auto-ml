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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  'Predict customer churn using historical data',
  'Image classification with transfer learning',
  'Sentiment analysis on product reviews',
  'Time series forecasting for sales data',
  'Anomaly detection in network traffic',
  'Recommendation engine for e-commerce'
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

  const PreviewIcon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[selectedIcon];
  const previewColors = resolveProjectColor(selectedColor, customColor);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Project' : 'Create New Project'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update your project details.'
              : 'Create a new project to organize your AutoML workflows.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* ── Title + Icon ─────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsIconPickerOpen(true)}
                className={cn(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-all hover:scale-105 focus:outline-none',
                  selectedColor !== 'custom' && previewColors.bg,
                  selectedColor !== 'custom' && previewColors.text,
                  selectedColor !== 'custom' && previewColors.border
                )}
                style={previewColors.style}
                title="Click to change icon"
              >
                {PreviewIcon && <PreviewIcon className="h-5 w-5" />}
              </button>
              <Input id="title" className="flex-1 bg-muted/40" placeholder="My ML Project" {...register('title')} />
            </div>
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* ── Description ──────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="description">Description</Label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {descriptionValue.length}/200
              </span>
            </div>
            <AnimatedPlaceholderTextarea
              id="description"
              placeholders={descriptionPlaceholders}
              interval={3500}
              autoResize
              rows={1}
              className="w-full resize-none bg-muted/40"
              value={descriptionValue}
              onChange={(e) => {
                if (e.target.value.length <= 200) {
                  setValue('description', e.target.value, { shouldValidate: true });
                }
              }}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {formError && (
            <p className="text-xs text-destructive">{formError}</p>
          )}

          {/* ── Color ────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-all',
                    selectedColor === color
                      ? 'border-foreground scale-110'
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
                      'relative h-7 w-7 rounded-full border-2 p-0 transition-all',
                      selectedColor === 'custom'
                        ? 'border-black dark:border-white scale-110'
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
              <p className="text-xs text-destructive">{errors.customColor.message}</p>
            )}
          </div>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isEditMode ? 'Save Changes' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Icon Picker Dialog */}
      <Dialog open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose an Icon</DialogTitle>
            <DialogDescription>Select an icon for your project</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-2 py-4">
            {projectIcons.map((iconName) => {
              const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => { setValue('icon', iconName); setIsIconPickerOpen(false); }}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-md border-2 transition-all hover:scale-105',
                    selectedIcon === iconName
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-accent'
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
